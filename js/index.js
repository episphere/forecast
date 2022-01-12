import { SimplexPlot } from "./SimplexPlot.js"
import { EmbedPlot } from "./EmbedPlot2.js"

const vField = "deaths"

const dataPromise = d3.json("/data/data.json")

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
  console.log(numberFields)

  const valueFieldSelect = document.getElementById("value-field")
  const stratFieldSelect = document.getElementById("strat-field")

  const data = new TAFFY(baseData)

  const dataEmbed = delayEmbed(data().get(), [vField], E, {tau: tau})
  const tRange = [tp + E*tau + nn, d3.extent(data().get(), d => d.t)[1]-tp]

  let forecasts = forecast(dataEmbed, tRange)
  forecasts = new TAFFY(forecasts)

  const simplexElement = document.getElementById("plot_ts")
  const simplexPlot = new SimplexPlot(simplexElement, data, forecasts, vField, {
    width: 520, height: 380, tRangePlot: [1, 400-16],
    margin: {left: 60, right: 30, top: 40, bottom: 40},
    weightColoring: true
  })


  const embedPlot = new EmbedPlot(document.getElementById("plot_alt"), data, forecasts, vField, {
    state: simplexPlot.state,
    distanceColoring: true,
    width: 380, height: 380, 
    margin: {left: 60, right: 30, top: 40, bottom: 40}
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
  timeSlider.setAttribute("style", `
    width: ${simplexPlot.scaleX(tRange[1]) - simplexPlot.scaleX(tRange[0]) + 16}px;
    position: absolute;
    left: ${simplexElement.getBoundingClientRect().left + simplexPlot.scaleX(tRange[0]) - 10}px;
  `)
  timeSlider.setAttribute("min", tRange[0])
  timeSlider.setAttribute("max", tRange[1])
  const timeLabel = document.createElement("span")
  timeLabel.innerText = timeSlider.value

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
    timeLabel.innerText = timeSlider.value
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