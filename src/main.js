import { SimplexPlot } from "./SimplexPlot.js"
import { EmbedPlot } from "./EmbedPlot.js"
import {simplex, delayEmbed} from "./forecastOld.js"
import { PhasePlot } from "./PhasePlot.js"
import { DistancePlot } from "./DistancePlot.js"

const vField = "deaths"

const dataPromise = d3.json("data/data.json")

let E = parseInt(document.getElementById("param-input-E").value)
let tp = 16
let nn = parseInt(document.getElementById("param-input-nn").value)
let tau = 1
let theta = parseFloat(document.getElementById("param-input-theta").value)

Promise.all([dataPromise]).then(datas => {

  const baseData = datas[0].map(d => {
    d.date = new Date(d.date)
    return d
  })

  const fieldTypes = new Map()
  for (const row of baseData) {
    for (const field of Object.keys(row)) {
      let types = fieldTypes.get(field)
      if (!types) {
        types = new Set()
        fieldTypes.set(field, types)
      }
      types.add(typeof row[field])
    }
  }
  
  const numberFields = []
  for (const fieldType of fieldTypes.entries()) {
    if (fieldType[1].has("number")) {
      numberFields.push(fieldType[0])
    }
  }

  const valueFieldSelect = document.getElementById("value-field")
  const stratFieldSelect = document.getElementById("strat-field")

  const data = new TAFFY(baseData)

  const dataEmbed = delayEmbed(data().get(), [vField], E, {tau: tau})
  const tRange = [tp + E*tau + nn, d3.extent(data().get(), d => d.t)[1]-tp]

  const forecastsBase = forecast(dataEmbed, tRange)
  const forecasts = new TAFFY(forecastsBase)

  const simplexElement = document.getElementById("plot_ts")
  // const simplexPlot = new SimplexPlot(simplexElement, data, forecasts, vField, {
  //   width: 520, height: 380, tRangePlot: [1, 400-16],
  //   margin: {left: 60, right: 30, top: 35, bottom: 30},
  //   weightColoring: true
  // })
  const simplexPlot = new SimplexPlot(simplexElement, baseData, forecastsBase, vField, {
    width: 520, height: 340, tRangePlot: [1, 400-16],
    margin: {left: 60, right: 30, top: 35, bottom: 30},
    weightColoring: true
  })

  simplexPlot.state.plotT = tRange[0] + Math.floor(0.75*(tRange[1] - tRange[0]))

  // TODO: For layout, do two flex boxes on top of each other.


  // TODO: Update this
  const dataEmbedDb = new TAFFY(dataEmbed)
  const embedPlot = new EmbedPlot(document.getElementById("plot_alt"), baseData, forecastsBase, vField, {
    state: simplexPlot.state,
    distanceColoring: true,
    width: 340, height: 340, 
    margin: {left: 60, right: 30, top: 35, bottom: 30}
  })

  const phasePlot = new PhasePlot(document.getElementById("plot_phase"), dataEmbedDb, forecasts, vField, {
    state: simplexPlot.state,
    weightColoring: true,
    width: 340, height: 340, 
    margin: {left: 60, right: 30, top: 20, bottom: 30}
  })

  const distancePlot = new DistancePlot(document.getElementById("plot_weight"), forecastsBase, vField, {
    state: simplexPlot.state,
    weightColoring: true,
    weightColorFunction: embedPlot.weightColorScale,
    width: 340, height: 340, 
    margin: {left: 60, right: 30, top: 20, bottom: 30}
  })


  // Controls

  function updateForecasts() {
    let forecasts = forecast(dataEmbed, tRange)
    forecasts = new TAFFY(forecasts)
    simplexPlot.updateForecasts(forecasts)
  }

  document.getElementById("param-input-E").addEventListener("input", updateForecasts)
  document.getElementById("param-input-nn").addEventListener("input", updateForecasts)
  document.getElementById("param-input-theta").addEventListener("input", updateForecasts)

  const timeContainer = document.getElementById("time-slider-container")

  const timeSlider = document.createElement("input")
  timeSlider.setAttribute("type", "range")
  timeSlider.setAttribute("class", "slider")
  
  // timeSlider.setAttribute("style", `
  //   width: ${simplexPlot.scaleX.range()[1] - simplexPlot.scaleX.range()[0] + 16}px;
  //   position: absolute;
  //   left: ${simplexElement.getBoundingClientRect().left + simplexPlot.scaleX.range()[0] - 10}px;
  // `)
  const sliderLeft = simplexElement.getBoundingClientRect().left + simplexPlot.scaleX(tRange[0]) - 10
  const sliderWidth = simplexPlot.scaleX(tRange[1]) - simplexPlot.scaleX(tRange[0]) + 10
  timeSlider.setAttribute("style", `
    width: ${sliderWidth}px;
    position: absolute;
    left: ${sliderLeft}px;
  `)
  timeSlider.setAttribute("min", tRange[0])
  timeSlider.setAttribute("max", tRange[1])
  timeSlider.setAttribute("value", simplexPlot.state.plotT)
  const timeLabel = document.createElement("label")
  timeLabel.innerText = timeSlider.value
  timeLabel.setAttribute("style", `\
    position: absolute;
    left: ${sliderLeft + sliderWidth + 20}px;
    font-size: .7em;
    color: brown;
    font-weight: bold;
  `)
  //timeLabel.style("left", sliderLeft + "px")

  const timeRect = document.createElement("div")
  timeRect.setAttribute("style", `
    width: ${simplexPlot.scaleX.range()[1] - simplexPlot.scaleX.range()[0]}px;
    position: absolute;
    left: ${simplexElement.getBoundingClientRect().left + simplexPlot.scaleX.range()[0] }px;
    height: 5px;
    background-color: #EEE;
    margin-top: 2px;
    border-radius: 2px;
  `)
  timeContainer.appendChild(timeRect)

  timeSlider.addEventListener("input", () => {
    simplexPlot.state.plotT = parseInt(timeSlider.value)
    timeLabel.innerText = "t = " + timeSlider.value
  })
  timeContainer.appendChild(timeSlider)
  //timeContainer.appendChild(timeLabel)

})

function forecast(dataEmbed, tRange, simpleNeighbors = true) {
  tp = 16
  E = parseInt(document.getElementById("param-input-E").value)
  nn = parseInt(document.getElementById("param-input-nn").value)
  tau = 1
  theta = parseFloat(document.getElementById("param-input-theta").value)

  let forecasts = []
  for (let ti = tRange[0]; ti <= tRange[1]; ti++) {
    for (let tpi = 1; tpi <= tp; tpi++) {
      const smapResult = simplex(dataEmbed, vField, ti, tpi, E, tau, nn, theta, {
        diffMode: false, trainRange: simpleNeighbors ? [1, ti - tp] : [1, ti - tpi]})
      forecasts.push({...smapResult, E:E, theta: theta, nn: nn, baseT: ti, tp: tpi})
    }
  }
  return forecasts
}