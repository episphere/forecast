import { DynamicState } from "./DynamicState.js"

export class Plot {
  constructor(element, opts, defaults) {

    this.element = element

    defaults.state = null
    opts = Object.assign(defaults, opts)
    Object.assign(this, opts)

    if (this.state == null) {
      this.state = new DynamicState()
    } 

    if (this.margin == null) {
      this.margin = {left: 0, right: 0, top: 0, bottom: 0}
    }

    this.nodes = {}
    
  }

  // == Tool Functions ==

  createAxisLeft(node, scale, label) {
    const axis = node.attr("transform", `translate(${this.margin.left},0)`)

    if (label == null) {
      label = ""
    }

    node.select("#label").remove()
    axis.append("text")
      .attr("id", "label")
      .attr("class", "plot-label")
      .text("↑ " + label)
      .attr("text-anchor", "start")
      .attr("fill", "currentColor")
      .attr("transform", `translate(${-this.margin.left}, 20)`)

    axis.call(d3.axisLeft(scale))

    const colorShade = 100
    const color = `rgb(${colorShade}, ${colorShade}, ${colorShade})`
    axis.selectAll("line")
      .style("stroke", color)

    axis.selectAll("path")
      .style("stroke", color)
      .style("visibility", "hidden")

    return axis
  }

  createAxisBottom(node, scale, label, opts={
    tickFilter: () => true,
    tickFormat: null
  }) {
    const axis = node.attr("transform",  `translate(0, ${this.height - this.margin.bottom})`)

    if (label == null) {
      label = ""
    }

    // TODO: Integer only option
    let ticks = scale.ticks()
    ticks = ticks.filter(opts.tickFilter)
    
    // TODO: This tick stuff needs to be made a lot more general (to support more fonts, etc.)
    const tickSpace = Math.abs(this.scaleX(ticks[1]) - this.scaleX(ticks[0]))
    const maxNumberLength = ticks.map(d => d.toString().length).sort()[ticks.length-1]
    const estTextWidth = 5.4 * maxNumberLength // TODO: Especially fix this bit! 
    const reduceTicks = estTextWidth > (tickSpace - 10)

    node.select("#label").remove()
    axis.append("text")
      .attr("id", "label")
      .attr("class", "plot-label")
      .text(label + "  →")
      .attr("text-anchor", "end")
      .attr("fill", "currentColor")
      .attr("transform", `translate(${this.width}, ${this.margin.bottom})`)

    if (opts.tickFormat == null) {
      opts.tickFormat = scale.tickFormat(axis.tickArguments)
    }

    axis.call(d3.axisBottom(scale)
      .tickValues(ticks)
      .tickFormat((d, i) => !reduceTicks || i % 2 == 0 ? opts.tickFormat(d) : ""))
      //.attr("stroke", "rgb(63, 63, 63)")

    const colorShade = 100
    const color = `rgb(${colorShade}, ${colorShade}, ${colorShade})`
    axis.selectAll("line")
      .style("stroke", color)

    axis.selectAll("path")
      .style("stroke", color)
      .style("visibility", "hidden")

    return axis
  }

  createGrid(node, scaleX, scaleY, highlight = () => false) {
    const line = d3.line() 
      .x(d => scaleX(d.x))
      .y(d => scaleY(d.y))

    const tickLinesX = scaleX.ticks().map(d => [
      {x: d, y: scaleY.domain()[0]},
      {x: d, y: scaleY.domain()[1]}
    ])

    const tickLinesY = scaleY.ticks().map(d => [
      {x: scaleX.domain()[0], y: d},
      {x: scaleX.domain()[1], y: d}
    ])
      
    node.selectAll("path")
      .data(tickLinesY.concat(tickLinesX))
      .join("path")
        .attr("d",  line)
        .attr("stroke-width", d => highlight(d[0].x) ? 1.8 : 0.8)
        .attr("stroke", "rgb(230, 230, 230)")  
        .attr("fill", "none")
  }

  // TODO: This is helpful to have here, but maybe too domain specific. Maybe better in another
  // subclass
  checkFocus(t, focusByDefault=false) {
    return this.state.focused == t || this.state.selected.has(t) || 
      (focusByDefault && this.state.selected.size == 0 && this.state.focused == null)
  }

  // TODO: More to simplex specific superclass
  kde(XW, h, hp = null, n = 40) {
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
    console.log(h, hp, domain)
    const step = (domain[1] - domain[0]) / n
    
    const wt = XW.reduce((t, x) => t + x[1], 0)
    
    const vs = []
    for (let a = domain[0]; a <= domain[1]; a += step) {
      let v = 0
      for (const [x, w] of XW) {
        v += w * norm.pdf((a - x) / h)
      }
      vs.push({y: a, v: v / wt})
      //console.log(a, v, v / wt)
    }
    
    return vs
  }
}