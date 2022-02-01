

export function simplex(dataEmbed, vField, t, tp, E, tau, nn, theta, opts = {}) {
  opts = {
    diffMode: false,
    trainRange: null,
    ...opts
  }

  if (opts.trainRange == null) {
    opts.trainRange = [1, t - tp] 
  }

  const {diffMode, trainRange} = opts
 
  const trainEmbed = dataEmbed.filter(d => d.t >= opts.trainRange[0] && d.t <= opts.trainRange[1] && d.t != t)

  
  const vT = get(dataEmbed, t)
  const distances = trainEmbed.filter(d => d.t != vT.t).map(d => [d, distance(d.point, vT.point)])
  distances.sort((a, b) => a[1] - b[1])
  let neighbors = distances.slice(0, Math.min(trainEmbed.length, nn))
  
  const w = Array.from({length: nn}, () => 0)
  const meanDistance = d3.mean(neighbors, d => d[1])  
  for (let i = 0; i < Math.min(neighbors.length, nn); i++) {
    const dist = neighbors[i][1]
    w[i] = Math.exp(-theta * dist / meanDistance)
    neighbors[i][0].w = w[i]
  }
  
  const nexts = neighbors.map(d => ({
    ...get(dataEmbed, d[0].t + tp),
    baseT: d[0].t, 
    w: d[0].w,
  }))
  
  neighbors = neighbors.map(d => ({...d[0], distance: d[1]}))
    
  let totalYh = 0
  let totalVectorYh = Array.from({length: vT.point.length}, () => 0)
  let totalW = 0
  let yh = null
    
  if (diffMode) {
    for (const [i, next] of nexts.entries()) {
      const wi = w[i]
      totalW += wi
      totalYh += (next[vField] - neighbors[i][vField])
    }
    
    yh = vT[vField] + totalYh / totalW
  } else {
    for (const [i, next] of nexts.entries()) {
      const wi = w[i]
      totalW += wi
      totalYh += wi * next[vField]
      totalVectorYh = add(totalVectorYh, multiply(next.point, wi))
    }
    
    yh = totalYh / totalW
    totalVectorYh
  }
      
  return {t: t + tp, yh: yh, neighbors: neighbors, yhVector: divide(totalVectorYh, totalW), nexts: nexts}
}

export function delayEmbed(data, fields, dim, args={}) {
  args = {
    tau: 1, 
    zField: null, 
    period: null, 
    prefix: "",
    ...args
  }
  
  const {tau, zField, period, prefix} = args
  
  const embedData = []
  const dataMap = d3.group(data, d => d[zField])
  
  for (const series of dataMap.values()) {
    for (let i = (dim-1)*tau; i < series.length; i++) {
      const row = {...series[i]}

      for (const field of fields) {
        const point = []
        const ts = []
        
        for (let j = (dim-1); j >= 0; j--) {
          const p = series[i-j*tau]
          point.push(p[field])
          ts.push(p.t)
          row[`${field}_t-${j}`] = p[field]
        }
        
        row["point"] = point
        row["ts"] = ts
      }
      
      embedData.push(row)
    }
  }
  
  return embedData
}

function distance(a, b) {
  let tot = 0.0
  for (let i = 0; i < a.length; i++) {
    tot = tot + ((a[i] - b[i])**2)
  }
  return Math.sqrt(tot)
}

function multiply(v, s) {
  return v.map(d => d * s)
}

function divide(v, s) {
  return v.map(d => d / s)
}

function add(v1, v2) {
  const v = []
  for (let i = 0; i < v1.length; i++) {
    v.push(v1[i] + v2[i])
  }
  return v
}

function get(series, val, field="t") {
  const start = series[0][field]
  const res = series[val - start]
  if (res[field] != val) {
    throw "Series not evenly increasing" 
  }
  return res
}