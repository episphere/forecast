import { Plot } from "./Plot.js"

export class EmbedPlot extends Plot {
  
  constructor(element, data, forecasts, vField, opts = {}) {
    super(element, opts, {
      weightColoring: true,
      hoverRadius: 30, 
      hp: 0.1,
      width: 640, 
      height: 480,
      state: null
    })

    this.data = data
    this.vField = vField

    this.weightColorScale = d3.scaleSequential([0, 1], d3.interpolateReds)

    try {
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

    this.setDefaults()

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
        .attr("id", `embed-gradient-${tpi}`)
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
      .style("stroke-dasharray", "3 1")
    
    this.nodes.nowLine = this.nodes.base.append("g")
      .attr("fill", "none")
    
    this.nodes.predictLine = this.nodes.base.append("g")
      .attr("fill", "none")
      .style("stroke-dasharray", "3 1")

  }

  updatePlotT() {
    this.now = this.forecasts.find(d => d.baseT == this.state.plotT && d.tp == this.state.plotTp)

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
      predictLine.push({to: forecast.tp, [this.vField]: forecast[this.vField]})
    }

    this.allValues = []
    neighborLines.forEach(d => d.forEach(d => this.allValues.push(d)))
    nextLines.forEach(d => d.forEach(d => this.allValues.push(d)))
    nowLine.forEach(d => this.allValues.push(d))
    predictLine.forEach(d => this.allValues.push(d))

    this.scaleX = d3.scaleLinear()
      .domain([-this.now.E+1, this.state.plotTp]) // TODO: Fix
      .range([this.margin.left, this.width - this.margin.right])
      .nice()

    this.scaleXDate = d3.scaleLinear()
      .domain([-this.now.E+1, this.state.plotTp]) // TODO: Fix
      .range([this.margin.left, this.width - this.margin.right])

    this.scaleY = d3.scaleLinear()
      .domain(d3.extent(this.allValues, d => d[this.vField]))
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

   
    // TODO: Interpolated Delaunay points so lines can be focused on between points
    this.delaunay = d3.Delaunay.from( this.allValues, 
      d => this.scaleX(d.to), d => this.scaleY(d[this.vField]))
    
    this.nodes.neighborLines
      .selectAll("path")
      .data(neighborLines)
      .join("path")
        .attr("id", d => `neighbor-${d[d.length-1].t}`)
        .attr("d",  this.line)
        .attr("stroke-width", 1.5)

    this.nodes.neighborLines
      .selectAll("circle")
      .data(this.neighbors)
      .join("circle")
        .attr("id", d => `neighbor-${d.t}`)
        .attr("cx",  this.scaleX(0))
        .attr("cy",  d => this.scaleY(d[this.vField]))
        .attr("r", 3)
    
    this.nodes.nextLines
      .selectAll("path")
      .data(nextLines)
      .join("path")
        .attr("id", d => `next-${d[0].t}`)
        .attr("d", this.line)
        .attr("stroke-width", 2)

    this.nodes.nowLine
      .selectAll("path")
      .data([nowLine])
      .join("path")
        .attr("id", `now`)
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

    const nexts = []
    for (const forecast of this.forecasts.filter(d => d.baseT == this.state.plotT)) {
      for (const next of forecast.nexts) {
        nexts.push({baseT: next.baseT, t: this.state.plotT + forecast.tp, tp: forecast.tp,
          [this.vField]: next[this.vField], w: next.w}) 
      }
    }
   

    const domainSize = Math.abs(this.scaleY.domain()[1] - this.scaleY.domain()[0])
    for (let tpi = 1; tpi <= this.tp; tpi++) {
      const tpNexts = nexts.filter(d => d.tp == tpi)
      const VW = tpNexts.map(d => [d[this.vField], d.w])
      const kdeRes = this.kde(VW, null, this.hp)

      //console.log(domainSize, kdeRes.map(d => 1 -  (d.y - this.scaleY.domain()[0]) / domainSize))
      const gradient = this.nodes.gradients.select(`#embed-gradient-${tpi}`)
      gradient.selectAll("stop")
        .data(kdeRes.reverse())
        .join("stop")
          .attr("offset", d => 1 -  (d.y - this.scaleY.domain()[0]) / domainSize)
          .attr("stop-color", d => `rgb(169, 76, 212, ${d.v})`)

    }

    const rectWidth = this.scaleX(1) - this.scaleX(0) 
    this.nodes.confRects
      .selectAll("rect")
      .data(Array.from({length: this.tp}, (_, i) => i+1))
      .join("rect")
        .attr("x", d => this.scaleX(d   - 1))
        .attr("y", this.margin.top)
        .attr("width", rectWidth)
        .attr("height", this.height - this.margin.bottom - this.margin.top)
        .attr("fill", d => `url(#embed-gradient-${d})`)
  }

  updateInteraction() {
    const coloringFunction = this.weightColoring ? 
      d => this.weightColorScale(d[0].w) : d => "red"

    const colorFunctionPast = d => !this.state.focused || this.state.focused == d[d.length-1].t 
      || this.state.selected.has(d[d.length-1].t) ?
      coloringFunction(d) : "lightgrey"
    const colorFunctionNext = d => !this.state.focused || this.state.focused == d[0].t 
      || this.state.selected.has(d[0].t) ?
      coloringFunction(d) : "lightgrey"

    this.nodes.neighborLines
      .selectAll("path") 
      .attr("stroke", colorFunctionPast)
          
    this.nodes.neighborLines
      .selectAll("circle")
      //.attr("fill",  colorFunction)

    this.nodes.nextLines
      .selectAll("path") 
      .attr("stroke",  colorFunctionNext)

    for (const raise of [ ...this.state.selected, this.state.focused]) {
      this.nodes.neighborLines.select(`#neighbor-${raise}`).raise()
      this.nodes.nextLines.select(`#next-${raise}`).raise()
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
    this.updateInteraction()
  }

  stateChanged(p, v) {
    if (p == "plotT" || p == "plotTp") {
      this.updatePlotT()
    }
    this.updateInteraction()
  }

  mouseMoved(e) {
    const neighbor = this.allValues[this.delaunay.find(e.offsetX, e.offsetY)]
    const p = [this.scaleX(neighbor.to), this.scaleY(neighbor[this.vField])]
    const dist = Math.hypot(p[0] - e.offsetX, p[1] - e.offsetY)
    
    if (dist < this.hoverRadius) {
      this.state.focused = neighbor.baseT
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