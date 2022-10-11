import { Plot } from "./Plot.js"
import * as d3 from "https://cdn.skypack.dev/d3@7"

// TODO: FIX REDRAWING BUG (also on other plots except TS)
export class EmbedPlot extends Plot {
  
  constructor(element, data, forecasts, vField, opts = {}) {
    super(element, opts, {
      weightColoring: true,
      hoverRadius: 10, 
      showShading: true,
      hp: 0.1,
      width: 640, 
      height: 480,
      state: null
    })

    this.data = data
    this.vField = vField
    this.forecasts = forecasts

    this.weightColorScale = d3.scaleSequential([0, 1], d3.interpolateReds)

    try {
      this.setDefaults()
      this.updateForecasts(forecasts)
    } catch(error) {
      console.error(error)
      this.plotFail()
    }

    this.element.append(this.nodes.base.node())
  }

  updateForecasts(forecasts) {
    if (forecasts.length == 0) {
      throw "No forecasts" 
    }


    this.forecasts = forecasts
    this.tp = d3.extent(this.forecasts, d => d.tp)[1]
    
    this.setWeightColoring(this.weightColoring)


    // Dynamic state
    this.state.defineProperty("selected", new Set())
    this.state.defineProperty("focused", null)
    this.state.defineProperty("plotT", this.tRange[1])    
    this.state.defineProperty("plotTp", this.tp)
    this.state.addListener((p, v) => this.stateChanged(p, v))

    this.createBase()
    this.updatePlotT()
    this.updateInteraction()
  }

  setDefaults() {
    this.tRange = d3.extent(this.forecasts, d => d.baseT)

    this.selects = {
      neighborLine: d3.select(),
      nextLine: d3.select(),
    }
  }

  createBase() {
    this.nodes.base
      .attr("width", this.width)
      .attr("height", this.height)
      .on("mousemove", e => this.mouseMoved(e))
      .on("mouseleave",  e => this.mouseLeft(e))
      .on("click",  e => this.mouseClicked(e))

    this.nodes.gridLines = this.nodes.base.append("g")
      .attr("id", "gridlines")

    this.nodes.axisX = this.nodes.base.append("g")
      .attr("stroke-width", 3)
    this.nodes.axisY = this.nodes.base.append("g")
      .attr("stroke-width", 3)

    this.nodes.confRects = this.nodes.base.append("g")
      .attr("id", "forecast-rects")

    this.nodes.gradients = this.nodes.base.append("g")
      .attr("id", "forecast-gradients") 
    for (let tpi = 1; tpi <= this.tp; tpi++) {
      this.nodes.gradients.append("linearGradient")
        .attr("id", `${this.id}-gradient-${tpi}`)
        .attr("gradientUnits", "userSpaceOnUse")
        .attr("y1", this.margin.top)
        .attr("y2", this.height - this.margin.bottom)
        .attr("x1", 0)
        .attr("x2", 0)
    }

    this.nodes.neighborLines = this.nodes.base.append("g")
      .attr("fill", "none")
    
    this.nodes.nextLines = this.nodes.base.append("g")
      .attr("fill", "none")
      .style("stroke-dasharray", "3 2")

    this.nodes.nowLine = this.nodes.base.append("g")
      .attr("fill", "none")
    
    this.nodes.predictLine = this.nodes.base.append("g")
      .attr("fill", "none")
      .style("stroke-dasharray", "3 1")

  }

  updatePlotT() {
    this.nowForecasts = this.forecasts.filter(d => d.baseT == this.state.plotT)
    this.now = this.nowForecasts.find(d => d.baseT == this.state.plotT && d.tp == this.state.plotTp)

    const neighbors = new Map()
    for (const forecast of this.forecasts.filter(d => d.baseT == this.state.plotT)) {
      for (const neighbor of forecast.neighbors) {
        neighbors.set(neighbor.t, neighbor)
      }
    }
    this.neighbors = [...neighbors.values()]

    const neighborLines = []
    for (const [i, neighbor] of this.neighbors.entries()) {
      const neighborLine = []
      for (let to = -this.now.E + 1; to <= 0; to++) {
        const neigh = this.data.find(d => d.t == neighbor.t + to)
        neighborLine.push({to: to, baseT: neighbor.t, t: neighbor.t + to, 
          [this.vField]: neigh[this.vField], w: neighbor.w})
      }
      neighborLines.push(neighborLine)
    }

    const nextLines = []
    for (const neighbor of this.neighbors) {
      const nextLine = [{
        ...neighbor,
        to: 0,
        baseT: neighbor.t
      }]
      for (let tpi = 1; tpi <= this.tp; tpi++) {
        if (neighbor.t + tpi > this.state.plotT) {
          break
        }

        nextLine.push({
          baseT: neighbor.t,
          w: neighbor.w,
          to: tpi, 
          [this.vField]: this.data.find(d => d.t == neighbor.t + tpi)[this.vField]
        })
      }
      nextLines.push(nextLine)
    }

    const nowLine = []
    for (let to = - this.now.E + 1; to <= 0; to++) {
      nowLine.push({baseT: this.now.t, to: to, [this.vField]: 
        this.data.find(d => d.t == this.now.baseT + to)[this.vField]})  
    }  
    
    let predictLine = []
    for (const forecast of this.forecasts.filter(d => d.baseT == this.state.plotT)) {
      predictLine.push({to: forecast.tp, [this.vField]: forecast[this.vField], baseT: this.now.baseT+1})
    }

    this.allValues = []
    neighborLines.forEach(d => d.forEach(d => this.allValues.push(d)))
    nextLines.forEach(d => d.forEach(d => this.allValues.push(d)))
    nowLine.forEach(d => this.allValues.push(d))
    predictLine.forEach(d => this.allValues.push(d))
    this.allValuesGroup = [...d3.group(this.allValues, d => d.baseT).entries()]

    this.scaleX = d3.scaleLinear()
      .domain([-this.now.E+1, this.state.plotTp]) // TODO: Fix
      .range([this.margin.left, this.width - this.margin.right])
      .nice()

    this.scaleXDate = d3.scaleLinear()
      .domain([-this.now.E+1, this.state.plotTp]) // TODO: Fix
      .range([this.margin.left, this.width - this.margin.right])

    const vs = []
    for (const forecast of this.nowForecasts) {
      if (forecast.kdeRes) {
        //forecast.kdeRes.ps.map(d => vs.push(d.v))
        forecast.kdeRes.ps.forEach(d => vs.push(d.v))
      }
    }
    

    let yExtent =  d3.extent([
      ...d3.extent(this.allValues, d => d[this.vField]),
      ...d3.extent(vs)
    ])
    this.scaleY = d3.scaleLinear()
      .domain(yExtent)
      .range([this.height - this.margin.bottom, this.margin.top])
      .nice()



    this.createGrid(this.nodes.gridLines, this.scaleX, this.scaleY, d => d == 0)


    this.createAxisBottom(this.nodes.axisX, this.scaleX, "t offset", {
      tickFilter: tick => Number.isInteger(tick),
      tickFormat: d3.format("d"),
      tickOffset: 5,
    })
    this.createAxisLeft(this.nodes.axisY, this.scaleY, this.vField)  

    this.line = d3.line() 
      .x(d => this.scaleX(d.to))
      .y(d => this.scaleY(d[this.vField]))

    this.delaunayPoints = []
    for (const allGroup of this.allValuesGroup) {
      const delaunayBasePoints = allGroup[1].map((d, i) => 
        ({x: this.scaleX(d.to), y: this.scaleY(d[this.vField]), baseT: allGroup[0]}))
      this.interpolate(delaunayBasePoints, this.hoverRadius - 5)
        .forEach(d => { d.baseT = allGroup[0]; this.delaunayPoints.push(d)})
    }
    this.delaunay = d3.Delaunay.from(this.delaunayPoints, 
      d => d.x, d => d.y)
    
    this.nodes.neighborLines
      .selectAll("path")
      .data(neighborLines)
      .join("path")
        .attr("id", d => `${this.id}-neighborLine-${d[d.length-1].t}`)
        .attr("d", this.line)
        .attr("stroke-width", 1.5)
        .attr("stroke", d => {
          const color = this.coloringFunction(d)
          return color
        })

    // this.nodes.neighborLines
    //   .selectAll("circle")
    //   .data(this.neighbors)
    //   .join("circle")
    //     .attr("id", d => `neighbor-${d.t}`)
    //     .attr("cx",  this.scaleX(0))
    //     .attr("cy",  d => this.scaleY(d[this.vField]))
    //     .attr("r", 3)
    
    this.nodes.nextLines
      .selectAll("path")
      .data(nextLines)
      .join("path")
        .attr("id", d => `${this.id}-nextLine-${d[0].baseT}`)
        .attr("d", this.line)
        .attr("stroke-width", 2)
        .attr("stroke", this.coloringFunction)

    this.nodes.nowLine
      .selectAll("path")
      .data([nowLine])
      .join("path")
        .attr("id", `${this.id}-now`)
        .attr("d", this.line)
        .attr("stroke-width", 3)
        .attr("stroke", "blue")

    this.nodes.nowLine
      .selectAll("circle")
      .data([nowLine[nowLine.length-1]])
      .join("circle")
        .attr("id", d => `now-${d.t}`)
        .attr("cx",  this.scaleX(0))
        .attr("cy",  d => this.scaleY(d[this.vField]))
        .attr("r", 3)
        .attr("fill", "blue")
      
    this.nodes.predictLine
      .selectAll("path")
      .data([predictLine])
      .join("path")
        .attr("id", d => `predict`)
        .attr("d", this.line)
        .attr("stroke-width", 2)
        .attr("stroke", "purple")

    this.updateKernelWidth(this.forecasts)

    const rectWidth = this.scaleX(1) - this.scaleX(0) 
    this.nodes.confRects
      .selectAll("rect")
      .data(Array.from({length: this.tp}, (_, i) => i+1))
      .join("rect")
        .attr("x", d => this.scaleX(d   - 1))
        .attr("y", this.margin.top)
        .attr("width", rectWidth)
        .attr("height", this.height - this.margin.bottom - this.margin.top)
        .attr("fill", d => `url(#${this.id}-gradient-${d})`)
  }

  updateKernelWidth(forecasts) {
    this.forecasts = forecasts

    if (!this.showShading) {
      return
    }

    const nowForecasts = this.forecasts.filter(d => d.baseT == this.state.plotT)
    for (const forecast of nowForecasts) {
      const domainSize = Math.abs(this.scaleY.domain()[1] - this.scaleY.domain()[0])
      const gap = forecast.kdeRes.ps[1].v-forecast.kdeRes.ps[0].v
      const kdeRes  = [
        {v: forecast.kdeRes.ps[0].v-gap, p:0}, 
        ...forecast.kdeRes.ps, 
        {v: forecast.kdeRes.ps[forecast.kdeRes.ps.length-1].v+gap, p:0}
      ]
      const gradient = this.nodes.gradients.select(`#${this.id}-gradient-${forecast.tp}`)
      gradient.selectAll("stop")
        .data(kdeRes.reverse())
        .join("stop")
          .attr("offset", d => 1 - (d.v - this.scaleY.domain()[0]) / domainSize)
          .attr("stop-color", d => `rgb(169, 76, 212, ${d.p})`)
    }
  }


  updateInteraction() {
    this.selects.neighborLine.attr("stroke",
      d => !this.state.disabled.has(`${this.state.plotT}-${d[0].t}`) ? "grey" : "lightgrey")
    this.selects.nextLine.attr("stroke", 
      d => !this.state.disabled.has(`${this.state.plotT}-${d[0].t}`) ? "grey" : "lightgrey")

    if (this.state.focused) {
      this.selects.neighborLine = 
        this.nodes.neighborLines.select(`#${this.id}-neighborLine-${this.state.focused}`) 
      this.selects.nextLine =
        this.nodes.nextLines.select(`#${this.id}-nextLine-${this.state.focused}`) 

      this.selects.neighborLine.attr("stroke", this.coloringFunction).raise()
      this.selects.nextLine.attr("stroke", this.coloringFunction).raise()
    } else {
      this.selects.neighborLine = this.nodes.neighborLines.selectAll("path")
      this.selects.nextLine = this.nodes.nextLines.selectAll("path")

      this.selects.neighborLine.attr("stroke", d => {
        const color = this.coloringFunction(d)
        return color
      })
      this.selects.nextLine.attr("stroke", this.coloringFunction)
    }

    
  }

  setShowDates(showDates) {
    this.showDates = showDates

    // this.nodes.xAxis
    //   .attr("visibility", this.showDates ?  "hidden" : "visible")
    // this.nodes.dateAxis
    //   .attr("visibility", this.showDates ?  "visible" : "hidden")
  }


  setWeightColoring(weightColoring) {
    this.weightColoring = weightColoring

    this.coloringFunction = d => { 
      if (!this.state.disabled.has(`${this.state.plotT}-${d[0].baseT}`)) {
        return this.weightColoring ? this.weightColorScale(d[0].w) : "red"
      } else {
        return "lightgrey"
      }
    }

    this.colorFunctionPast = d => !this.state.focused || this.state.focused == d[d.length-1].t 
      || this.state.selected.has(d[d.length-1].t) ?
      this.coloringFunction(d) : "lightgrey"
    this.colorFunctionNext = d => !this.state.focused || this.state.focused == d[0].t 
      || this.state.selected.has(d[0].t) ?
      this.coloringFunction(d) : "lightgrey"

    if (this.nodes.neighborLines) {
      this.updateInteraction()
    }
  }

  interpolate(points, minDist) {
    const interPoints = [points[0]]
  
    for (let i = 0; i < points.length-1; i++) {
      const p1 = points[i]
      const p2 = points[i+1]
  
      const d = Math.sqrt((p2.x - p1.x)**2 + (p2.y - p1.y)**2)
      const dr = 1 / Math.floor(d / minDist)
  
      //const p = [(1 - dr)*p1.x + dr*p2.x, (1 - dr)*p1.y + dr*p2.y]
      for (let dri = dr; dri < .9999; dri += dr) {
        interPoints.push({x: (1 - dri)*p1.x + dri*p2.x, y: (1 - dri)*p1.y + dri*p2.y, i: i})
      }
      interPoints.push(p2)
    }
  
    return interPoints
  }

  stateChanged(p, v) {
    if (p == "plotT" || p == "plotTp") {
      this.updatePlotT()
    }
    
    this.updateInteraction()
  }

  mouseMoved(e) {
    const delaunayPoint = this.delaunayPoints[this.delaunay.find(e.offsetX, e.offsetY)]
    //const neighbor = this.allValues[delaunayPoint.i]
    //const p = [this.scaleX(neighbor.to), this.scaleY(neighbor[this.vField])]
    const dist = Math.hypot(delaunayPoint.x - e.offsetX, delaunayPoint.y - e.offsetY)
    
    if (dist < this.hoverRadius) {
      this.state.focused = delaunayPoint.baseT
      this.element.style.cursor = "pointer"
    } else {
      this.state.focused = null
      this.element.style.cursor = "default"
    }
  }

  mouseLeft(e) {

  }

  mouseClicked(e) {
    if (this.state.focused != null) {
      this.state.selected = this.state.selected.add(this.state.focused)
    } else {
      this.state.selected = new Set()
    }
  }
}