import { SimplexPlot } from "./SimplexPlot.js"
import { EmbedPlot } from "./EmbedPlot.js"
import { PhasePlot } from "./PhasePlot.js"
import { DistancePlot } from "./DistancePlot.js"
import {simplex, delayEmbed, kde} from "./forecast.js"

let vField = null

let simplexPlot, embedPlot, phasePlot, distancePlot;

// --- Data loading ---

const tFieldSelect = document.getElementById("tfield-select")
const vFieldSelect = document.getElementById("vfield-select")
const sFieldSelect = document.getElementById("sfield-select")
const tFieldToggle = document.getElementById("tfield-toggle")

let data = null
function updateData(newData) {
  data = newData
  const fields = Object.keys(data[0])

  tFieldSelect.innerHTML = ""
  vFieldSelect.innerHTML = ""
  sFieldSelect.innerHTML = ""


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
  addOption(sFieldSelect, "NONE")
  sFields.forEach(d => addOption(sFieldSelect, d))
}

let forecasts = []

function runData(data) {
  const E = parseInt(document.getElementById("param-input-E").value)
  const nn = parseInt(document.getElementById("param-input-nn").value)
  const theta = parseFloat(document.getElementById("param-input-theta").value)
  const tp = parseInt(document.getElementById("param-input-tp").value)
  const hp = parseFloat(document.getElementById("param-kernel-width").value)

  vField = vFieldSelect.value
  const sField = sFieldSelect.value 
  const tField = tFieldSelect.value

  if (sField != "NONE") {
    const groups = d3.group(data, d => d[sField])
    data = [...groups.values()][0] // TODO: Group select 
  }

  dateToggle.disabled = !tFieldToggle.checked
  if (tFieldToggle.checked) {
    data.forEach(d => d.___date = new Date(d[tField]))
    data.sort((a, b) => a.___date - b.___date)
  } else {
    data.forEach(d => d.t = parseFloat(d[tField]))
    data.sort((a, b) => a.t - b.t)
  }
  data.map((d,i) => d.t = i) // TODO: Don't erase "t" field

  for (const row of data) {
    row[vField] = parseFloat(row[vField])
    row.t = parseInt(row.t)
  }

  forecasts = simplex(data, vField, tp, E, nn, theta)
  for (const forecast of forecasts) {
    const VW = forecast.nexts.map(d => [d[vField], d.w])
    forecast.kdeRes = kde(VW, null, hp)
  }
  
  simplexPlot = new SimplexPlot(document.getElementById("plot_ts"), data, forecasts, vField, {
    dateField: tFieldToggle.checked ? tField : null,
    width: 520, height: 340,
    margin: {left: 60, right: 30, top: 35, bottom: 30},
  })

  embedPlot = new EmbedPlot(document.getElementById("plot_alt"), data, forecasts, vField, {
    state: simplexPlot.state,
    width: 340, height: 340, 
    margin: {left: 60, right: 30, top: 35, bottom: 30}
  })
  
  const dataEmbed = delayEmbed(data, [vField], E)
  phasePlot = new PhasePlot(document.getElementById("plot_phase"), dataEmbed, forecasts, vField, {
    state: simplexPlot.state,
    width: 340, height: 340, 
    margin: {left: 60, right: 30, top: 30, bottom: 30}
  })
  
  distancePlot = new DistancePlot(document.getElementById("plot_weight"), forecasts, vField, {
    state: simplexPlot.state,
    weightColorFunction: embedPlot.weightColorScale,
    width: 340, height: 340, 
    margin: {left: 60, right: 30, top: 20, bottom: 30}
  })

  createTimeSlider(document.getElementById("time-slider-container"), 
    simplexPlot.element, simplexPlot.scaleX, simplexPlot.tForecastRange, simplexPlot.state)
}

function createTimeSlider(timeContainer, plotElement, scaleX, tRange,  state) {
  timeContainer.innerHTML = ""

  const timeSlider = document.createElement("input")
  timeSlider.setAttribute("type", "range")
  timeSlider.setAttribute("class", "slider")

  const sliderLeft = plotElement.getBoundingClientRect().left + scaleX(tRange[0]) - 10
  const sliderWidth = scaleX(tRange[1]) - scaleX(tRange[0]) + 10
  timeSlider.setAttribute("style", `
    width: ${sliderWidth}px;
    position: absolute;
    left: ${sliderLeft}px;
  `)
  timeSlider.setAttribute("min", tRange[0])
  timeSlider.setAttribute("max", tRange[1])
  timeSlider.setAttribute("value", state.plotT)

  const label = document.createElement("label")
  const labelText = state.plotT + ""
  label.innerHTML = labelText // TODO: Has to be a better way to do this.
  label.setAttribute("style", `
    float: right;
    font-size: 10px;
    position: absolute;
    left: ${sliderLeft - labelText.length*6.5}px;
    top: 0px;
  `)

  timeSlider.addEventListener("input", () => {
    state.plotT = parseInt(timeSlider.value)
    label.innerHTML = state.plotT + ""
  })


  
  timeContainer.appendChild(label)
  timeContainer.appendChild(timeSlider)
}

const collapsibles = document.getElementsByClassName("collapsible")
for (const collapsible of collapsibles) {
  collapsible.addEventListener("click", () => {
    const content = collapsible.nextElementSibling // TODO: I don't like this.
    content.style.display = content.style.display == "block" ? "none" : "block"   
  })
}

const dataSelectLabel = document.getElementById("data-select-label")
dataSelectLabel.innerHTML = "mortality.csv"

document.getElementById("data-select").addEventListener("change", e => {
  const file = e.target.files[0]

  const reader = new FileReader()
  function parseFile() {
    let data = null
    if (file.type == "application/json") {
      data = JSON.parse(reader.result)
    } else {
      data = d3.csvParse(reader.result)
    }
    updateData(data)
    dataSelectLabel.innerHTML = file.name
  }

  reader.addEventListener("load", parseFile, false);
  if (file) {
    reader.readAsText(file)
  }
})

document.getElementById("run-button").addEventListener("click", () => {
  runData(data)
})

function updateForecasts() {
  runData(data)
}

const runParam = document.getElementById("param-run")
runParam.addEventListener("click", () => {
  updateForecasts()
  runParam.innerHTML = "Run"
})

//document.getElementById("param-input-E").addEventListener("input", updateForecasts)
document.getElementById("param-input-E").addEventListener("input", () => runParam.innerHTML = "Run*")
document.getElementById("param-input-nn").addEventListener("input", () => runParam.innerHTML = "Run*")
document.getElementById("param-input-theta").addEventListener("input", () => runParam.innerHTML = "Run*")

const kernelWidthInput = document.getElementById("param-kernel-width")
kernelWidthInput.addEventListener("change", () => {
  for (const forecast of forecasts) {
    const VW = forecast.nexts.map(d => [d[vField], d.w])
    forecast.kdeRes = kde(VW, null, parseFloat(kernelWidthInput.value))
  }
  
  simplexPlot.updateKernelWidth(forecasts)
  embedPlot.updateKernelWidth(forecasts)
})

const weightToggle = document.getElementById("weight-coloring-toggle")
weightToggle.addEventListener("input", () => {
  simplexPlot.setWeightColoring(weightToggle.checked)
  embedPlot.setWeightColoring(weightToggle.checked)
  phasePlot.setWeightColoring(weightToggle.checked)
  distancePlot.setWeightColoring(weightToggle.checked)
})



const dateToggle = document.getElementById("show-dates-toggle")
dateToggle.addEventListener("input", () => {
  simplexPlot.setShowDates(dateToggle.checked)
  //embedPlot.setShowDates(dateToggle.checked)
})

// ---------


d3.json("data/data.json").then(data => {
  updateData(data)
  tFieldSelect.value = "date"
  vFieldSelect.value = "deaths"
  sFieldSelect.value = "___s"
  runData(data)
})


// new SimplexPlot(document.getElementById("plot_ts"), [], [], vField, {
//   width: 520, height: 340,
//   margin: {left: 60, right: 30, top: 35, bottom: 30},}
// )

// new EmbedPlot(document.getElementById("plot_alt"), [], [], vField, {
//   width: 340, height: 340, 
//   margin: {left: 60, right: 30, top: 35, bottom: 30}
// })

// new PhasePlot(document.getElementById("plot_phase"), [], [], vField, {
//   width: 340, height: 340, 
//   margin: {left: 60, right: 30, top: 20, bottom: 30}
// })

// new DistancePlot(document.getElementById("plot_weight"), [], vField, {
//   width: 340, height: 340, 
//   margin: {left: 60, right: 30, top: 20, bottom: 30}
// })