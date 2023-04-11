import * as d3 from "https://cdn.skypack.dev/d3-array@3";
import {default as gaussian}  from 'https://cdn.skypack.dev/gaussian@1.2.0?min'

/**
 * Performs EDM simplex forecasting.
 * 
 * @param {object[]} data The data in array format. Each row requires a date field and a value field. Values in date field must be unique. If the rows have 't' field then it will be used instead of the date field.
 * @param {string} vField The name of the value field.
 * @param {number} tp Forecast horizon: how far foward into the futture to forecast.
 * @param {number} E Embedding dimension: length of embedded vectors. 
 * @param {number} nn Nearest neighbors: number of nearest neighbors.
 * @param {number} theta Affects the calculation of weight. The higher the value, the more distance affects the weight of each neighbor in the calculation.
 * @param {number[]} args.dateField The name of the date field.
 * @param {number[]} args.forecastDomain The time range in which to perform forecasting.
 * @returns {object[]} The forecasts. 
 */
export function simplex(data, vField, tp, E, nn, theta, args = {}) {

  args = {
    forecastDomain: null,
    dateField: null,
    ...args
  }
  let {forecastDomain, dateField} = args

  if (data[0].t == undefined) {
    if (dateField) {
      data.forEach(row => row.date = new Date(row.date))
      data.sort((a,b) => a.date - b.date)
    }

    data.forEach((row, i) => row.t = i)
  }

  const dataEmbed = delayEmbed(data, [vField], E, {tau: 1})
  const tExtent = d3.extent(data, d => d.t)

  if (forecastDomain == null) {
    forecastDomain = [tExtent[0] + tp + E + nn, tExtent[1]]
  }


  const forecasts = [] 
  for (let ti = forecastDomain[0]; ti <= forecastDomain[1]; ti++) {

    const embedRow = get(dataEmbed, ti) 
    const baseTrainData = dataEmbed.filter(d => d.t <= ti - tp)
    let neighbors = findNeighbors(baseTrainData, embedRow, nn)

    weightNeighbors(neighbors, theta)

    for (let tpi = 1; tpi <= tp; tpi++) {
      const nexts = [] 
      for (const neighbor of neighbors) {
        nexts.push({baseT: neighbor.t, w: neighbor.w,
                    ...get(dataEmbed, neighbor.t + tpi)})
      }

      let vh = 0
      let totalW = 0
      let yhVector = Array.from({length: E}, () => 0)
      for (const next of nexts) {
        totalW += next.w
        vh += next.w * next[vField] 
        yhVector = add(yhVector, multiply(next.embed, next.w))
      }
      vh = vh / totalW 

      forecasts.push({t: ti + tpi, baseT: ti, tp: tpi, [vField]: vh, nowPoint: embedRow, neighbors: neighbors, nexts: nexts, 
        yhVector: divide(yhVector, totalW), E: E, nn: nn, theta: theta})
    } 
  }
  
  return forecasts
}

/**
 * Calculates the kernels used to generate the shaded forecast area.
 * 
 * @param {number[][]} XW Pairs of numbers, each containing the value and weight of a neighbor.
 * @param {number} opts.kernelWidth The width of the kernel. 
 * @returns 
 */
export function kde(XW, opts={}) {
  opts = Object.assign({kernelWidth: null, n: 80, c: 0.0000001}, opts)
  let {kernelWidth, n, c} = opts

  if (kernelWidth == null) {
    kernelWidth = Math.max(d3.deviation(XW, d => d[0]), 0.000001)*2
  }

  const norm = gaussian(0, 1)

  const vRange = d3.extent(XW, d => d[0])
  const domain = [vRange[0]-kernelWidth*0.5, vRange[1]+kernelWidth*0.5]
  const step = (domain[1] - domain[0])/n
  const s = 1 / (norm.pdf(0)*XW.length)
  const h = Math.sqrt((-2/kernelWidth**2)*Math.log(c*Math.sqrt(2*Math.PI)))

  const points = []
  const kernelPoints = []
  
  for (let a = domain[0]; a <= domain[1]; a += step) {
    let totalP = 0
    for (const [i, [x,w]] of XW.entries()) {
      const p = s * w * norm.pdf(h*(a-x))
      totalP += p 
      kernelPoints.push({v: a, p, k:i})
    }
    points.push({v: a, p: totalP})
  }

  return {ps: points, kernelPs: kernelPoints}
}


export function fcDisable(forecasts, vField, disabled) {

  for (const forecast of forecasts) {

    let vh = 0
    let totalW = 0
    let yhVector = Array.from({length: forecast.yhVector.length}, () => 0)
    for (const next of forecast.nexts.filter(d => !disabled.has(`${forecasts[0].baseT}-${d.baseT}`))) {
      totalW += next.w
      vh += next.w * next[vField] 
      yhVector = add(yhVector, multiply(next.embed, next.w))
    }
    vh = vh / totalW 
    
    forecast.yhVector = divide(yhVector, totalW)
    forecast[vField] = vh 
  }
  

}

function get(series, val, field="t") {
  return series.find(d => d[field] == val)
}

export function delayEmbed(data, fields, E, args = {}) {
  args = {
    tau: 1,
    outField: "embed",
    outTimeField: "ts",
    ...args
  }

  const {tau, tRange, outField, outTimeField} = args

  if (!Array.isArray(fields)) {
    fields = [fields]
  }

  const embedData = []
  for (let i = (E-1)*tau; i < data.length; i++) {
    const row = {...data[i]}
    for (const field of fields) {
      const point = []
      const ts = []

      for (let j = (E-1); j >= 0; j--) {
        const p = data[i-j*tau]
        point.push(p[field])
        ts.push(p.t)
      }

      row[fields.length > 1 ? `${outField}_${field}` : outField] = point
      row[fields.length > 1 ? `${outTimeField}_${field}` : outTimeField] = ts
    }
    embedData.push(row)
  }
  
  return embedData
}

export function weightNeighbors(neighbors, theta) {
  const meanDistance = d3.mean(neighbors, d => d.distance)
  neighbors.forEach(d => {
    d.w = Math.exp(-theta * d.distance / meanDistance)
  })
  return neighbors
}

export function findNeighbors(trainData, embedRow, nn, neighbors=null, newData=null) {
  if (neighbors == null) {
    neighbors = trainData.map(d => ({...d, distance: distance(d.embed, embedRow.embed)}))
    neighbors = neighbors.sort((a, b) => a.distance - b.distance).slice(0, nn)
  } else {
    for (const row of newData) {
      const newNeighbor = ({...row, distance:  distance(row.embed, embedRow.embed)})
      neighbors = bottomQueueAdd(neighbors, newNeighbor, (a, b) => a.distance - b.distance)
    }
  }

  return neighbors
}


// ###### Helper functions ######

function distance(a, b) {
  let tot = 0.0
  for (let i = 0; i < a.length; i++) {
    tot = tot + ((a[i] - b[i])**2)
  }
  return Math.sqrt(tot)
}

function add(v1, v2) {
  const v = []
  for (let i = 0; i < v1.length; i++) {
    v.push(v1[i] + v2[i])
  }
  return v
}

function multiply(v, s) {
  return v.map(d => d * s)
}

function divide(v, s) {
  return v.map(d => d / s)
}

