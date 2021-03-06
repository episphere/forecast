import * as d3 from "https://cdn.skypack.dev/d3-array@3";
import {default as gaussian}  from 'https://cdn.skypack.dev/gaussian@1.2.0?min'

// TODO: Reduce memory footprint
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
    let neighbors = findNeighbors(baseTrainData, embedRow, nn)

    // const meanDistance = d3.mean(neighbors, d => d.distance)
    // neighbors.forEach(d => {
    //   d.w = Math.exp(-theta * d.distance / meanDistance)
    // })
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

export function fcDisable(forecasts, vField, disabled) {
  // const neighbors = forecasts[0].neighbors

  // const totalW = d3.sum(neighbors, d => d.w)
  // neighbors.forEach(d => d.w = d.w/totalW)


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

// Experimented with kernels which get wider when w is lower, but this lead to very wide kernels 
// at low values of w. Wasn't a very intuitive way to look at it, as the size of the kernels could
// then exceed the range of the data, so we went with the simpler, better behaved kernels in kde().
export function kdeWiden(XW, opts={}) {
  opts = Object.assign({hp:1, hf: null, wf:8, n: 80, outputKernels: false}, opts)
  let {hp, hf, wf, n, outputKernels} = opts
  
  const norm = gaussian(0, 1)
    
  const minV = d3.min(XW, d => d[0])
  const maxV = d3.max(XW, d => d[0])

  if (!hf) {
    hf = Math.max(maxV - minV, 0.00001)
  }
  const h = hf*hp

  const rangeValues = []
  for (const [x, w] of XW) {
    const value = h * norm.ppf(0.999) / (w * wf)
    rangeValues.push(x + value)
    rangeValues.push(x - value)
  }

  const domain = d3.extent(rangeValues)
  const step = (domain[1] - domain[0]) / n
  const sc = 1 / (norm.pdf((0) / h))

  const vs = []
  const kernelVs = []
  for (let a = domain[0]; a < domain[1]; a += step) {
    let totalV = 0
    for (const [i, [x, w]] of XW.entries()) {
      const v = sc * w * norm.pdf((a - x)*w*wf / h) / XW.length
      totalV += v 
      if (outputKernels) {
        kernelVs.push({v: a, p: v , k: i})
      }
    }
    vs.push({v: a, p: totalV })
  }

  const out = {ps: vs}
  if (outputKernels) {
    out.kernelPs = kernelVs
  }
  return out
}

// KDE which doesn't get wider, just taller
export function kde(XW, opts={}) {
  opts = Object.assign({hp:.1, hf: null, n: 80}, opts)
  let {hp, hf, n} = opts

  const norm = gaussian(0, 1)
    
  const minV = d3.min(XW, d => d[0])
  const maxV = d3.max(XW, d => d[0])

  if (!hf) {
    hf = Math.max(maxV - minV, 0.00001)
  }

  const ppf = .999
  const widthSc = norm.ppf(ppf)*2
  const h = widthSc/(hp*hf)
  
  const rangeValues = []
  for (const [x, w] of XW) {
    const value = norm.ppf(ppf)/h
    rangeValues.push(x + value)
    rangeValues.push(x - value)
  }

  const domain = d3.extent(rangeValues)
  const step = (domain[1] - domain[0]) / n
  const sc = 1 / (norm.pdf(0)*XW.length)

  const vs = []
  const kernelVs = []
  for (let a = domain[0]; a < domain[1]; a += step) {
    let totalV = 0
    for (const [i, [x, w]] of XW.entries()) {
      const v = sc * w * norm.pdf(h*(a - x))
      totalV += v
      kernelVs.push({v: a, p: v, k: i})
    }
    vs.push({v: a, p: totalV})
  }

  return {ps: vs, kernelPs: kernelVs}
}

// export function kde(XW, h, hp = null, n = 40) {
//   const norm = gaussian(0, 1)
    
//   const min = d3.min(XW, d => d[0])
//   const max = d3.max(XW, d => d[0])
//   if (h == null && hp != null) {
//     h = (max - min) * hp
//   }

//   const domain = [
//     min - norm.ppf(0.999)*h,
//     max + norm.ppf(0.999)*h
//   ]
//   const step = (domain[1] - domain[0]) / n

//   const wt = XW.reduce((t, x) => t + x[1], 0)

//   const vs = []
//   const kernelVs = []
//   for (let a = domain[0]; a <= domain[1]; a += step) {
//     let v = 0
//     for (const [i, [x, w]] of XW.entries()) {
//       const val = w * norm.pdf((a - x) / h)
//       v += val
//       kernelVs.push({y: a, v: val / wt, k: i})
//     }
//     vs.push({y: a, v: v / wt})
//   }

//   return {vs: vs, kernelVs: kernelVs}
// }

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