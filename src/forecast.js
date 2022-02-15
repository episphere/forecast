import * as d3 from "https://cdn.skypack.dev/d3-array@3";
import {default as gaussian}  from 'https://cdn.skypack.dev/gaussian@1.2.0?min'

export function simplex(data, vField, tp, E, nn, theta, args = {}) {

  args = {
    tau: 1,
    forecastDomain: null,
    ...args
  }
  let {tau, forecastDomain} = args

  const dataEmbed = delayEmbed(data, [vField], E, {tau: tau})
  const tExtent = d3.extent(data, d => d.t)

  if (forecastDomain == null) {
    forecastDomain = [tExtent[0] + tp + E + nn, tExtent[1]]
  }


  const forecasts = [] 
  for (let ti = forecastDomain[0]; ti <= forecastDomain[1]; ti++) {
    // TODO: If we re-add complex neighbor mode, then this code needs to change.
    // The getNeighbors() functon is designed to allow a complex neighbor mode but because it will
    // complicate the visualization, I've left it out for now. 
    
    const embedRow = get(dataEmbed, ti) 
    const baseTrainData = dataEmbed.filter(d => d.t <= ti - tp)
    let neighbors = getNeighbors(baseTrainData, embedRow, nn)

    const meanDistance = d3.mean(neighbors, d => d.distance)
    neighbors.forEach(d => {
      d.w = Math.exp(-theta * d.distance / meanDistance)
    })


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

function get(series, val, field="t") {
  return series.find(d => d[field] == val)
  // const start = series[0][field]
  // const res = series[val - start]
  // return res
}

export function delayEmbed(data, fields, E, args = {}) {
  args = {
    tau: 1,
    outField: "embed",
    outTimeField: "ts",
    ...args
  }

  const {tau, tRange, outField, outTimeField} = args

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

      row[outField] = point
      row[outTimeField] = ts
    }
    embedData.push(row)
  }
  
  return embedData
}

export function kde(XW, h, hp = null, n = 40) {
  const norm = gaussian(0, 1)
    
  const min = d3.min(XW, d => d[0])
  const max = d3.max(XW, d => d[0])
  if (h == null && hp != null) {
    h = (max - min) * hp
  }

  const domain = [
    min - norm.ppf(0.999)*h,
    max + norm.ppf(0.999)*h
  ]
  const step = (domain[1] - domain[0]) / n

  const wt = XW.reduce((t, x) => t + x[1], 0)

  const vs = []
  const kernelVs = []
  for (let a = domain[0]; a <= domain[1]; a += step) {
    let v = 0
    for (const [i, [x, w]] of XW.entries()) {
      const val = w * norm.pdf((a - x) / h)
      v += val
      kernelVs.push({y: a, v: val / wt, k: i})
    }
    vs.push({y: a, v: v / wt})
  }

  return {vs: vs, kernelVs: kernelVs}
}

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

function getNeighbors(trainData, embedRow, nn, neighbors=null, newData=null) {
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