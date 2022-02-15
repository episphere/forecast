import { SimplexPlot } from "./SimplexPlot.js"
import { EmbedPlot } from "./EmbedPlot.js"
import { PhasePlot } from "./PhasePlot.js"
import { DistancePlot } from "./DistancePlot.js"
import {simplex, delayEmbed, kde} from "./forecast.js"

const vField = null

let E = 6
let tp = 16
let nn = 8
let tau = 1
let theta = 1

// --- Data loading ---

const tFieldSelect = document.getElementById("tfield-select")
const vFieldSelect = document.getElementById("vfield-select")
const sFieldSelect = document.getElementById("sfield-select")

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

function runData(data) {
  const vField = vFieldSelect.value
  const sField = sFieldSelect.value 

  if (sField != "NONE") {
    const groups = d3.group(data, d => d[sField])
    data = [...groups.values()][0]
  }

  for (const row of data) {
    row[vField] = parseFloat(row[vField])
    row.t = parseInt(row.t)
  }

  const forecasts = simplex(data, vField, tp, E, nn, theta)
  for (const forecast of forecasts) {
    const VW = forecast.nexts.map(d => [d[vField], d.w])
    forecast.kdeRes = kde(VW, null, 0.1)
  }
  
  const simplexPlot = new SimplexPlot(document.getElementById("plot_ts"), data, forecasts, vField, {
    width: 520, height: 340,
    margin: {left: 60, right: 30, top: 35, bottom: 30},
  })

  const embedPlot = new EmbedPlot(document.getElementById("plot_alt"), data, forecasts, vField, {
    state: simplexPlot.state,
    width: 340, height: 340, 
    margin: {left: 60, right: 30, top: 35, bottom: 30}
  })
  
  const dataEmbed = delayEmbed(data, [vField], E)
  new PhasePlot(document.getElementById("plot_phase"), dataEmbed, forecasts, vField, {
    state: simplexPlot.state,
    width: 340, height: 340, 
    margin: {left: 60, right: 30, top: 20, bottom: 30}
  })
  
  new DistancePlot(document.getElementById("plot_weight"), forecasts, vField, {
    state: simplexPlot.state,
    weightColorFunction: embedPlot.weightColorScale,
    width: 340, height: 340, 
    margin: {left: 60, right: 30, top: 20, bottom: 30}
  })
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

// ---------


d3.json("data/data.json").then(data => {
  updateData(data)
  tFieldSelect.value = "t"
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