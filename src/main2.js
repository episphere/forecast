import { SimplexPlot } from "./SimplexPlot.js"
import { EmbedPlot } from "./EmbedPlot.js"
import { PhasePlot } from "./PhasePlot.js"
import { DistancePlot } from "./DistancePlot.js"
import {simplex, delayEmbed, kde} from "./forecast.js"

// TODO: Cache data


let vField = null
let hf = 1

let simplexPlot, embedPlot, phasePlot, distancePlot;

// Inputs
const tFieldSelect = document.getElementById("tfield-select")
const vFieldSelect = document.getElementById("vfield-select")
const sFieldSelect = document.getElementById("sfield-select")
const tFieldToggle = document.getElementById("tfield-toggle")

const paramInputE = document.getElementById("param-input-E")
const paramInputNn = document.getElementById("param-input-nn")
const paramInputTheta = document.getElementById("param-input-theta")
const paramInputTp = document.getElementById("param-input-tp")
const paramInputHp = document.getElementById("param-kernel-width")

const kernelWidthInput = document.getElementById("param-kernel-width")
const weightToggle = document.getElementById("weight-coloring-toggle")
const dateToggle = document.getElementById("show-dates-toggle")

let fieldValues = {
  E: "6", nn: "8", theta: "1.0", tp: "16", hp: "0.1", weight: "true", date: "false",
  tField: "date", vField: "deaths", sField: "___s", timeIsDate: "true"
}

const queryString = window.location.hash;
let hashParams = new URLSearchParams(queryString.slice(1))
fieldValues = {...fieldValues, ...Object.fromEntries(hashParams.entries())}

paramInputE.value = fieldValues.E
paramInputNn.value = fieldValues.nn
paramInputTheta.value = fieldValues.theta
paramInputTp.value = fieldValues.tp
kernelWidthInput.value = fieldValues.hp
weightToggle.checked = fieldValues.weight == "true" ? true : false
dateToggle.checked = fieldValues.date  == "true" ? true : false

function addOption(select, field) {
  const option = document.createElement("option")
  option.setAttribute("value", field)
  option.innerHTML = field
  select.appendChild(option)
}

addOption(tFieldSelect, fieldValues.tField)
addOption(vFieldSelect, fieldValues.vField)
addOption(sFieldSelect, fieldValues.sField)

tFieldSelect.disabled = true
vFieldSelect.disabled = true
sFieldSelect.disabled = true
tFieldToggle.disabled = true
tFieldToggle.checked = fieldValues.timeIsDate  == "true" ? true : false



//const hashParams = {}

// --- Data loading ---


let data = null
let filename = null
function updateData(newData) {
  data = newData
  const fields = Object.keys(data[0])

  tFieldSelect.innerHTML = ""
  vFieldSelect.innerHTML = ""
  sFieldSelect.innerHTML = ""

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

  tFieldSelect.disabled = false
  vFieldSelect.disabled = false
  sFieldSelect.disabled = false
  tFieldToggle.disabled = false
  runButton.disabled = false
  document.getElementById("file-warning").style.display = "none"
}

let forecasts = []

function runData(data) {
  const E = parseInt(paramInputE.value)
  const nn = parseInt(paramInputNn.value)
  const theta = parseFloat(paramInputTheta.value)
  const tp = parseInt(paramInputTp.value)
  const hp = parseFloat(paramInputHp.value)

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

  const vRange = d3.extent(data, d => d[vField])
  hf = vRange[1] - vRange[0]
  forecasts = simplex(data, vField, tp, E, nn, theta)
  for (const forecast of forecasts) {
    const VW = forecast.nexts.map(d => [d[vField], d.w])
    forecast.kdeRes = kde(VW, {hp: hp, hf: hf})
  }
  
  simplexPlot = new SimplexPlot(document.getElementById("plot_ts"), data, forecasts, vField, {
    plotT:  fieldValues.t,
    dateField: tFieldToggle.checked ? tField : null,
    showDates: dateToggle.checked,
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
    margin: {left: 60, right: 30, top: 20, bottom: 35}
  })

  createTimeSlider(document.getElementById("time-slider-container"), 
    simplexPlot.element, simplexPlot.scaleX, simplexPlot.tForecastRange, simplexPlot.state)

  document.getElementById("plot-params").style.display = "flex"
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
  timeSlider.setAttribute("value", !isNaN(fieldValues.t) ? parseInt(fieldValues.t) : state.plotT)

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
    //hashParams.t = state.plotT
    hashParams.set("t", state.plotT)
    updateHashParams()
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
dataSelectLabel.innerHTML = "NO FILE"

function uploadFile(file) {
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
    filename = file.name
  }

  reader.addEventListener("load", parseFile, false);
  if (file) {
    reader.readAsText(file)
  }
}

document.getElementById("data-select").addEventListener("change", e => {
  const file = e.target.files[0]
  uploadFile(file)
})

const runButton = document.getElementById("run-button")
runButton.addEventListener("click", () => {
  hashParams.delete("t")
  delete fieldValues.t
  hashParams.set("file", filename)
  hashParams.set("tField", tFieldSelect.value)
  hashParams.set("vField", vFieldSelect.value)
  hashParams.set("sField", sFieldSelect.value)
  hashParams.set("timeIsDate", tFieldToggle.checked)
  updateHashParams()
  runData(data)
})
runButton.disabled = true

function updateForecasts() {
  runData(data)
}

function updateHashParams() {
  //window.location.hash = [...Object.entries(hashParams)].map(d => d.join("=")).join("&")
  window.location.hash = hashParams.toString()

  //const hashString = window.location.hash;

}

const runParam = document.getElementById("param-run")
runParam.addEventListener("click", () => {
  updateForecasts()
  hashParams.set("tp", paramInputTp.value)
  hashParams.set("E", paramInputE.value)
  hashParams.set("nn",  paramInputNn.value)
  hashParams.set("theta", paramInputTheta.value)
  updateHashParams()
  runParam.innerHTML = "Run"
})

//document.getElementById("param-input-E").addEventListener("input", updateForecasts)
paramInputTp.addEventListener("input", () => runParam.innerHTML = "Run*")
paramInputE.addEventListener("input", () => runParam.innerHTML = "Run*")
paramInputNn.addEventListener("input", () => runParam.innerHTML = "Run*")
paramInputTheta.addEventListener("input", () => runParam.innerHTML = "Run*")

kernelWidthInput.addEventListener("change", () => {
  const hp = parseFloat(kernelWidthInput.value)
  for (const forecast of forecasts) {
    const VW = forecast.nexts.map(d => [d[vField], d.w])
    forecast.kdeRes = kde(VW, {hp: hp, hf: hf})
  }
  
  simplexPlot.updateKernelWidth(forecasts)
  embedPlot.updateKernelWidth(forecasts)
  hashParams.set("hp", hp)
  updateHashParams()
})

weightToggle.addEventListener("input", () => {
  simplexPlot.setWeightColoring(weightToggle.checked)
  embedPlot.setWeightColoring(weightToggle.checked)
  phasePlot.setWeightColoring(weightToggle.checked)
  distancePlot.setWeightColoring(weightToggle.checked)

  hashParams.set("weight", weightToggle.checked)
  updateHashParams()
})



dateToggle.addEventListener("input", () => {
  simplexPlot.setShowDates(dateToggle.checked)
  //embedPlot.setShowDates(dateToggle.checked)

  hashParams.set("date", dateToggle.checked)
  updateHashParams()
})

const overlay = document.getElementById("file-upload-overlay")
document.addEventListener("dragover", (e) => {
  e.preventDefault();
})


document.addEventListener("dragenter", (e) => {
  overlay.style.display = "block"
})

overlay.addEventListener("dragleave", (e) => {
  overlay.style.display = "none"
})

document.addEventListener("drop", (e) => {
  e.preventDefault()

  overlay.style.display = "none"
  document.getElementById("file-select-content").style.display = "block"
  if (e.dataTransfer.items.length > 0) {
    if (e.dataTransfer.items[0].kind === 'file') {
      var file = e.dataTransfer.items[0].getAsFile()
      uploadFile(file)
    }
  }

})


// ---------

if (fieldValues.file) {
  const div = document.getElementById("file-warning")//document.createElement("div") 
  div.classList.add("file-request")
  const text = document.createElement("div")
  text.innerHTML = `The URL contains the name of a file: <i>${fieldValues.file}</i>. </br>
  Either upload this file, or click "ignore" to view the default data.`
  div.appendChild(text)

  const button = document.createElement("button")
  button.innerHTML = "Ignore"
  button.style.marginTop = "10px"
  button.addEventListener("click", () => {
    window.location.hash = ""
    window.location.reload()
  })
  div.appendChild(button)

  document.getElementById("file-select-content").style.display = "block"
  document.getElementById("file-warning").style.display = "block"

} else {
  d3.json("data/data.json").then(data => {
    dataSelectLabel.innerHTML = "mortality.csv"
    updateData(data)
    tFieldSelect.value = fieldValues.tField
    vFieldSelect.value = fieldValues.vField
    sFieldSelect.value = fieldValues.sField
    runData(data)
  })
}
