import { SimplexPlot } from "./SimplexPlot.js"
import { EmbedPlot } from "./EmbedPlot.js"
import {simplex, delayEmbed} from "./forecast.js"
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

  //------


  const collapsibles = document.getElementsByClassName("collapsible")
  for (const collapsible of collapsibles) {
    collapsible.addEventListener("click", () => {
      const content = collapsible.nextElementSibling // TODO: I don't like this.
      content.style.display = content.style.display == "block" ? "none" : "block"   
    })
  }

  document.getElementById("data-select-label").innerHTML = "mortality.csv"

  const fieldSelects = document.getElementsByClassName("field-select")

  const tFieldSelect = document.getElementById("tfield-select")
  const vFieldSelect = document.getElementById("vfield-select")
  const sFieldSelect = document.getElementById("sfield-select")
  
  function updateData(data) {
    const fields = Object.keys(data[0])

    function addOption(select, field) {
      const option = document.createElement("option")
      option.setAttribute("value", field)
      option.innerHTML = field
      select.appendChild(option)
    }

    let tFields = new Set()
    let vFields = new Set()
    let sFields = new Set()

    const taken = (sets, field) => sets.some(d => d.has(field)) ? 1 : 0

    // TODO: Use moment.js
    for (const field of fields) {
      if (Date.parse(data[0][field])) {
        tFields.add(field)
      }
    }

    fields.sort((a, b) => 
      taken([tFields], a) - taken([tFields], b))

    for (const field of fields) {
      if (!isNaN(data[0][field])) {
        vFields.add(field)
        tFields.add(field)
      }
    }

    fields.sort((a, b) => 
      taken([tFields, vFields], a) -  taken([tFields, vFields], b))

    for (const field of fields) {
      sFields.add(field)
    }


    tFields.forEach(d => addOption(tFieldSelect, d))
    vFields.forEach(d => addOption(vFieldSelect, d))
    sFields.forEach(d => addOption(sFieldSelect, d))
  
  }

  updateData(baseData)

  document.getElementById("data-select").addEventListener("change", e => {
    const file = e.target.files[0]

    const reader = new FileReader()
    function parseFile() {
      const data = d3.csvParse(reader.result)
      //updateData(data)
    }

    reader.addEventListener("load", parseFile, false);
    if (file) {
      reader.readAsText(file)
    }

  })

  //------


  const valueFieldSelect = document.getElementById("value-field")
  const stratFieldSelect = document.getElementById("strat-field")

  const data = new TAFFY(baseData)

  //const dataEmbed = delayEmbed(data().get(), [vField], E, {tau: tau})
  const tRange = [tp + E*tau + nn, d3.extent(data().get(), d => d.t)[1]-tp]

  const forecastsBase = simplex(baseData, vField, tp, E, nn, theta)//forecast(dataEmbed, tRange)
  const forecasts = new TAFFY(forecastsBase)

  const simplexElement = document.getElementById("plot_ts")
  // const simplexPlot = new SimplexPlot(simplexElement, data, forecasts, vField, {
  //   width: 520, height: 380, tRangePlot: [1, 400-16],
  //   margin: {left: 60, right: 30, top: 35, bottom: 30},
  //   weightColoring: true
  // })
  //const simplexPlot = new SimplexPlot(simplexElement, baseData, forecastsBase, vField, {
  const simplexPlot = new SimplexPlot(simplexElement, [], [], vField, {
    width: 520, height: 340, tRangePlot: [1, 400-16],
    margin: {left: 60, right: 30, top: 35, bottom: 30},
    weightColoring: true
  })

  simplexPlot.state.plotT = tRange[0] + Math.floor(0.75*(tRange[1] - tRange[0]))

  // TODO: For layout, do two flex boxes on top of each other.


  // TODO: Update this
  //const dataEmbedDb = new TAFFY(dataEmbed)
  //const embedPlot = new EmbedPlot(document.getElementById("plot_alt"), baseData, forecastsBase, vField, {
  console.log("Embed Plot")
  const embedPlot = new EmbedPlot(document.getElementById("plot_alt"), [], [], vField, {
    state: simplexPlot.state,
    width: 340, height: 340, 
    margin: {left: 60, right: 30, top: 35, bottom: 30}
  })

  const dataEmbed = delayEmbed(baseData, [vField], E)
  const phasePlot = new PhasePlot(document.getElementById("plot_phase"), dataEmbed, forecastsBase, vField, {
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
    // let forecasts = forecast(dataEmbed, tRange)
    // forecasts = new TAFFY(forecasts)
    // simplexPlot.updateForecasts(forecasts)
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