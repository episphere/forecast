import { Plot } from "./Plot.js"
import * as d3 from "https://cdn.skypack.dev/d3@7"

// TODO: Double click to change date.
// TODO: Better proportional coloring.
// TODO: Minimizable tooltip
export class SimplexPlot extends Plot {
  
  constructor(element, data, forecasts, vField, opts = {}) {
    super(element, opts, {
      plotT: null,
      weightColoring: true,
      showDates: false,
      dateField: null,
      plotAllTp: true,
      showAllProjLines: false,
      showProjShades: true,
      hp: 0.1,
      hoverRadius: 10, 
      tRangePlot: null,
      showShading: true,
      showTooltip: true,
      width: 640, 
      height: 480
    })

    this.data = data
    if (this.dateField) {
      this.data.forEach(d => d.___date = new Date(d[this.dateField]))
    }
    
    this.vField = vField

    this.weightColorScale = d3.scaleSequential([0, 1], d3.interpolateReds)//d3.interpolateOrRd)

    try {
      this.updateForecasts(forecasts)
    } catch(error) {
      this.plotFail()
      console.error(error)
    }
    
    this.element.append(this.nodes.base.node())
  }

  setDefaults() {
    //this.tRange = d3.extent(this.forecasts, d => d.baseT)
    this.tRange = d3.extent(this.data, d => d.t)
    if (this.tRangePlot == null) {
      this.tRangePlot = [this.tRange[0], this.tRange[1] + this.tp]
    }
    this.tForecastRange = d3.extent(this.forecasts, d => d.baseT)
    this.tForecastRange[0] += 1

    this.selects = {
      neighborLine: d3.select(),
      neighbor: d3.select(),
      nowLine: d3.select(),
      now: d3.select(),
      projLine: d3.select()
    }
  }

  updateForecasts(forecasts) {
    this.forecasts = forecasts
    this.tp = d3.extent(this.forecasts, d => d.tp)[1]

    this.setDefaults()

    function bound(v, range) {
      return Math.min(Math.max(range[0], v), range[1])
    }

    let plotT = null 
    if (this.plotT < 0) {
      plotT = this.tForecastRange[1] + this.plotT
    } else if (typeof this.plotT != "number" || isNaN(this.plotT)) {      
      plotT = this.tForecastRange[1]
    } else {
      plotT = this.plotT
    }
    plotT = bound(plotT, this.tForecastRange)

    // Dynamic state
    this.state.defineProperty("selected", new Set())
    this.state.defineProperty("focused", null)
    this.state.defineProperty("plotT", plotT)
    this.state.defineProperty("plotTp", this.tp)
    this.state.addListener((p, v) => this.stateChanged(p, v))

    this.createBase()
    this.updatePlotT()
    this.updateInteraction()
    this.setShowDates(this.showDates)
  }

  createBase() {
    this.nodes.base 
      .attr("id", `${this.id}-simplex`)
      .attr("width", this.width)
      .attr("height", this.height)
      .on("mousemove", e => this.mouseMoved(e))
      .on("mouseleave",  e => this.mouseLeft(e))
      .on("click",  e => this.mouseClicked(e))

    this.line = d3.line() 
      .x(d => this.scaleX(d.t))
      .y(d => this.scaleY(d[this.vField]))

    const allValues = []
    this.forecasts.filter(d => d.t >= this.tRangePlot[0] && d.t <= this.tRangePlot[1]).forEach(d => {
      allValues.push(d.yh)
    })
    this.data.filter(d => d.t >= this.tRangePlot[0] && d.t <= this.tRangePlot[1]).forEach(d => {
      allValues.push(d[this.vField])
    })

    this.scaleX = d3.scaleLinear()
      .domain(this.tRangePlot) 
      .range([this.margin.left, this.width - this.margin.right])
      //.nice()

    // TODO: Handle dates outside this class.
    if (this.dateField) {
      const dateInterval = this.data[1].___date.getTime() - this.data[0].___date.getTime()
      const dateRange = d3.extent(this.data.filter(d => d.t >= this.tRangePlot[0] && d.t <= this.tRangePlot[1]), 
        d => d.___date)
      dateRange[1] = new Date(dateRange[1].getTime()
        + dateInterval * this.tp)


      this.scaleXDate = d3.scaleUtc()
        .domain(dateRange) 
        .range([this.margin.left, this.width - this.margin.right])
        //.nice()
    }



    this.scaleY = d3.scaleLinear()
      .domain(d3.extent(allValues))
      .range([this.height - this.margin.bottom, this.margin.top])
      .nice()

    this.nodes.gridLines = this.nodes.base.append("g")
      .attr("id", `${this.id}-gridlines`)

    this.createGrid(this.nodes.gridLines, this.scaleX, this.scaleY)

    this.nodes.axisX = this.nodes.base.append("g")
      .attr("stroke-width", 1.5)
    this.nodes.axisY = this.nodes.base.append("g")
      .attr("stroke-width", 1.5)
    this.createAxisLeft(this.nodes.axisY, this.scaleY, this.vField)

    this.nodes.paths = this.nodes.base.append("g")
      .attr("fill", "none")
      .attr("stroke-linejoin", "round")
      .attr("stroke-linecap", "round") 

    this.nodes.now = this.nodes.base.append("g")
    this.nodes.projLines = this.nodes.base.append("g")
    this.nodes.predict = this.nodes.base.append("g")
    this.nodes.neighbors = this.nodes.base.append("g")
    this.nodes.neighborLines = this.nodes.base.append("g")
    this.nodes.neighborRecons = this.nodes.base.append("g")
    this.nodes.nowLine = this.nodes.base.append("g")
    this.nodes.gradients = this.nodes.base.append("g")
      .attr("class", "plot-gradient") 
    this.nodes.confRects = this.nodes.base.append("g")
    this.nodes.nexts = this.nodes.base.append("g")
      .attr("visibility", "hidden")

    
    for (let tpi = 1; tpi <= this.tp; tpi++) {
      this.nodes.gradients.append("linearGradient")
        .attr("id", `${this.id}-gradient-${tpi}`)
        .attr("gradientUnits", "userSpaceOnUse")
        //.attr("y1", this.margin.top)
        .attr("y1", this.margin.top)
        .attr("y2", this.height - this.margin.bottom)
        .attr("x1", 0)
        .attr("x2", 0)
    }

    const rectWidth = this.scaleX(1) - this.scaleX(0)
    this.nodes.confRects
      .selectAll("rect")
      .data(Array.from({length: this.tp}, (_, i) => i+1))
      .join("rect")
        //.attr("x", d => this.scaleX(d + this.state.plotT - 1))
        .attr("y", this.margin.top)
        .attr("width", rectWidth)
        .attr("height", this.height - this.margin.bottom - this.margin.top)
        //.attr("fill", d => `rgb(${Math.random()*255}, 0, 0, ${Math.random()})`)
        .attr("fill", d => `url(#${this.id}-gradient-${d})`)



    this.nodes.tooltip = d3.select(this.element).append("div")
      .style("opacity", 0)
      .attr("class", "tooltip")
      .style("background-color", "rgba(255, 255, 255, .8)")
      .style("border", "solid")
      .style("border-width", "1px")
      .style("border-radius", "2px")
      .style("padding", "5px")
      .style("position", "absolute")
      .style("font-size", ".6em")
      .style("width", "fit-content")
    
    //this.element.append(this.nodes.base.node())
  }

  updatePlotT() {

    this.now = this.forecasts.find(d => d.baseT == this.state.plotT && d.tp == this.state.plotTp)

    this.nodes.paths.selectAll("*").remove()
    
    this.nodes.paths.append("path")
      .datum(this.data.filter(d => d.t >= this.state.plotT && d.t <= this.tRangePlot[1]))
      .attr("d", this.line)
      .attr("stroke", "lightgrey")
      .attr("stroke-width", 1)
      .attr("fill", "none")
    
    this.nodes.paths.append("path")
      .datum(this.data.filter(d => d.t <= this.state.plotT))
      .attr("d", this.line)
      .attr("stroke", "grey")//"darkseagreen")
      .attr("stroke-width", 2)
      .attr("fill", "none")

    const neighbors = new Map()
    this.neighborsFrom = new Map()

    for (const forecast of this.forecasts.filter(d => d.baseT == this.state.plotT)) {
      for (const neighbor of forecast.neighbors) {
        let from = this.neighborsFrom.get(neighbor.t)
        if (from == null) {
          from = []
          this.neighborsFrom.set(neighbor.t, from)
        }
        from.push(forecast.tp)

        neighbors.set(neighbor.t, neighbor)
      }
    }
    this.neighbors = [...neighbors.values()]

    const nowPoint = this.data.find(d => d.t == this.now.baseT)
    this.points = this.neighbors.concat([{
      ...nowPoint
    }])
    
    this.nodes.neighbors.selectAll("circle")
      .data(this.neighbors)
      .join("circle")
        .attr("id", (d, i) => `${this.id}-neighbor-${d.t}`)
        .attr("cx", d => this.scaleX(d.t))
        .attr("cy", d => this.scaleY(d[this.vField]))
        .attr("stroke", "brown")
        .attr("stroke-width", 1)
        .attr("r", 3)
        .attr("fill", (d) => this.weightColoring ? 
          this.weightColorScale(d.w) : "red")

    const neighborLines = []
    for (const [i, neighbor] of this.neighbors.entries()) {
      const neighborLine = []
      for (let to = 0; to > -this.now.E; to--) {
        const neigh = this.data.find(d => d.t == neighbor.t + to)
        neighborLine.push({t: neighbor.t + to, [this.vField]: neigh[this.vField]})
      }
      neighborLines.push(neighborLine)
    }

    const nowLine = []
    for (let to = 0; to > -this.now.E; to--) {
      const now = this.data.find(d => d.t == nowPoint.t + to)
      nowLine.push({t: now.t, [this.vField]: now[this.vField]})
    }
    
    this.nodes.neighborLines
      .selectAll("path")
      .data(neighborLines)
      .join("path")
        .attr("id", d => `${this.id}-neighborLine-${d[0].t}`)
        .attr("d",  this.line)
        .attr("stroke-width", 1.5)
        .attr("stroke", "red")  
        .attr("fill", "none")
        .attr("visibility", "hidden")

    this.nodes.nowLine
      .attr("id", `${this.id}-nowLine`)
      .selectAll("path")
      .data([nowLine])
      .join("path")
        .attr("d",  this.line)
        .attr("stroke-width", 3)
        .attr("stroke", "blue")  
        .attr("fill", "none")
        .style("visibility", "hidden")
    
    this.nodes.now
      .attr("id", `${this.id}-now`)
      .selectAll("circle")
      .data([this.data.find(d => d.t == this.now.baseT)])
      .join("circle")
        .attr("cx", d => this.scaleX(d.t))
        .attr("cy", d => this.scaleY(d[this.vField]))
        .attr("r", 2)
        .attr("fill", "blue")


    const projLines = []
    for (const neighbor of this.neighbors) {
      const projLine = [{
        ...neighbor,
        t: this.state.plotT,
        baseT: neighbor.t
      }]
      for (let tpi = 1; tpi <= this.tp; tpi++) {
        // if (neighbor.t + tpi > this.state.plotT) {
        //   break
        // }

        if (!this.neighborsFrom.get(neighbor.t).includes(tpi)) {
          continue
        }

        projLine.push({
          baseT: neighbor.t,
          w: neighbor.w,
          t: this.state.plotT + tpi, 
          [this.vField]: this.data.find(d => d.t == neighbor.t + tpi)[this.vField]
        })
      }
      projLines.push(projLine)
    }

    this.nodes.projLines.selectAll("path")
      .data(projLines)
      .join("path")
        .attr("id", d => `${this.id}-projLine-${d[0].baseT}`)
        .attr("d", this.line)
        //.attr("stroke", "pink")
        .attr("stroke", d => `rgb(255, 0, 0, ${d[0].w})`) // TODO: Better
        .attr("stroke-width", 1)
        .attr("fill", "none") 
        .attr("visibility", "hidden")


    const forecastLine = this.forecasts.filter(d => d.baseT == this.state.plotT)
  
    this.nodes.predict
      .selectAll("path")
      .data([forecastLine])
      .join("path")
        .attr("d", this.line)
        .attr("stroke", "purple")
        .attr("stroke-width", 1.5)
        .attr("fill", "none")
        .style("stroke-dasharray", "2 1")

   

    const nexts = []
    for (const forecast of this.forecasts.filter(d => d.baseT == this.state.plotT)) {
      for (const next of forecast.nexts) {
        nexts.push({baseT: next.baseT, t: this.state.plotT + forecast.tp, tp: forecast.tp,
          [this.vField]: next[this.vField], w: next.w}) 
      }
    }

    this.nodes.nexts.selectAll("circle")
      .data(nexts)
      .join("circle")
        .attr("cx", d => this.scaleX(d.t))
        .attr("cy", d => this.scaleY(d[this.vField]))
        .attr("r", 2)
        .attr("stroke", "red")
        .attr("fill", "none")

    

    // this.kdeResMap = new Map()

    // const domainSize = Math.abs(this.scaleY.domain()[1] - this.scaleY.domain()[0])
    // for (const forecast of this.forecasts.filter(d => d.baseT == this.state.plotT)) {
    //   //const VW = forecast.nexts.map(d => [d[this.vField], d.w])
    //   //const kdeRes = this.kde(VW, null, this.hp)
    //   const kdeRes = forecast.kdeRes
    //   const kdeData = [...kdeRes.vs].reverse()
    //   if (forecast.kdeRes) {
    //     const gradient = this.nodes.gradients.select(`#${this.id}-gradient-${forecast.tp}`)
    //     gradient.selectAll("stop")
    //       .data(kdeData)
    //       .join("stop")
    //         .attr("offset", d => 1 -  (d.y - this.scaleY.domain()[0]) / domainSize)
    //         .attr("stop-color", d => `rgb(169, 76, 212, ${d.v})`)

    //     this.kdeResMap.set(forecast.tp, kdeRes)
    //   }
    // }

    this.updateKernelWidth(this.forecasts)

    this.nodes.confRects
      .selectAll("rect")
        .attr("x", d => this.scaleX(d + this.state.plotT  - 1))
        .attr("fill", d => `url(#${this.id}-gradient-${d})`)

    this.delaunay = 
      d3.Delaunay.from(this.points, d => this.scaleX(d.t), d => this.scaleY(d[this.vField]))

  }

  updateKernelWidth(forecasts) {
    this.forecasts = forecasts

    if (!this.showShading) {
      return
    }

    const nowForecasts = this.forecasts.filter(d => d.baseT == this.state.plotT)
    for (const forecast of nowForecasts) {
      const domainSize = Math.abs(this.scaleY.domain()[1] - this.scaleY.domain()[0])
      const kdeRes = [...forecast.kdeRes.ps]
      const gradient = this.nodes.gradients.select(`#${this.id}-gradient-${forecast.tp}`)
      gradient.selectAll("stop")
        .data(kdeRes.reverse())
        .join("stop")
          .attr("offset", d => 1 -  (d.v - this.scaleY.domain()[0]) / domainSize)
          .attr("stop-color", d => `rgb(169, 76, 212, ${d.p})`)
    }
  }


  updateInteraction() {
    this.selects.neighborLine.attr("visibility", "hidden")
    this.selects.neighbor.attr("r", 3)
    this.selects.nowLine.style("visibility",  "hidden")
    this.selects.now.attr("r", 3)
    this.selects.projLine.attr("visibility",  this.showAllProjLines ? "visible" : "hidden")

    if (this.state.focused) {
      this.selects.neighbor = 
        this.nodes.neighbors.select(`#${this.id}-neighbor-${this.state.focused}`) 
      this.selects.neighborLine = 
        this.nodes.neighborLines.select(`#${this.id}-neighborLine-${this.state.focused}`) 
      this.selects.nowLine = this.nodes.nowLine.selectAll("path")
      this.selects.now = this.nodes.now.selectAll("circle")
      this.selects.projLine =
        this.nodes.projLines.select(`#${this.id}-projLine-${this.state.focused}`) 
      
      
      this.selects.neighbor.attr("r", 4)
      this.selects.neighborLine.attr("visibility", "visible")
      this.selects.projLine.attr("visibility",  "visible" )

      if (this.state.focused == this.state.plotT) {
        this.selects.nowLine.style("visibility",  "visible")
        this.selects.now.attr("r", 4)
      }

    }
  }

  updatePlotTp(plotT) {
    // TODO: Implement
  }

  setShowDates(showDates){
    this.showDates = showDates
    if (this.showDates && this.dateField) {
      this.createAxisBottom(this.nodes.axisX, this.scaleXDate, "date", {
        //tickFormat: tick => tick.toISOString().slice(0, 4),
        tickFilter: d => true
        //tickFilter: (d, i) => i % 2 == 0,
      })
      this.createGrid(this.nodes.gridLines, this.scaleXDate, this.scaleY)
    } else {
      this.createAxisBottom(this.nodes.axisX, this.scaleX, "t")
      this.createGrid(this.nodes.gridLines, this.scaleX, this.scaleY) 
    }

  }

  setWeightColoring(weightColoring) {
    this.weightColoring = weightColoring
    this.nodes.neighbors.selectAll("circle")
      .attr("fill", d => this.weightColoring ? 
        this.weightColorScale(d.w) : "red")
    this.updateInteraction()
  }

  setShowAllProjLines(showAllProjLines) {
    this.showAllProjLines = showAllProjLines
    this.updateInteraction()
    //this.nodes.projLines.attr("visibility", showAllProjLines ? "visible" : "hidden")
  }

  setShowProjShade(showProjShades) {
    this.showProjShades = showProjShades
    this.nodes.confRects.style("visibility", showProjShades ? "visible" : "hidden")
  }

  // Should be two value fields, one for previous
  stateChanged(property, value) {
    if (property == "plotT" || property == "plotTp") {
      this.updatePlotT()
    }
    this.updateInteraction()
  }

  valueTable(values) {
    let tableHtml = `<table cellpadding="1" >`
    for (const [k, v] of values) {
      tableHtml += `
      <tr>
        <th style="text-align: right"> ${k} </td>
        <td> ${v} </td>
      </tr>
      `
    }
    tableHtml += `</table>`
    return tableHtml
  }

  intListStr(list) {
    let strs = [] 
    
    let first = list[0]
    let last = list[0]
    for (let i = 1; i < list.length; i++) {
      if (list[i] == last + 1) {
        last = list[i] 
      } else {
        strs.push(first == last ? first : [first, last].join("-"))
        first = list[i]
        last = list[i]
      }
    }
    strs.push(first == last ? first : [first, last].join("-"))
    
    return strs.join(", ")
  }

  mouseMoved(e) {
    const neighbor = this.points[this.delaunay.find(e.offsetX, e.offsetY)]

    const p = [this.scaleX(neighbor.t), this.scaleY(neighbor[this.vField])]
    const dist = Math.hypot(p[0] - e.offsetX, p[1] - e.offsetY)
    
    if (dist < this.hoverRadius) {
      this.state.focused = neighbor.t 

      if (this.state.focused == this.state.plotT) {
        return 
      }

      let values = [["t", neighbor.t]]
      if (this.dateField) {
        //values.push(["date", neighbor[this.dateField]])
        // TODO: Smart date formatting
        values.push(["date", neighbor.___date.toLocaleString()])
      }
      values = values.concat([
        ["distance", neighbor.distance.toPrecision(3)], // TODO: Automatic
        ["weight", neighbor.w.toFixed(2)],
        ["tp", this.intListStr(this.neighborsFrom.get(neighbor.t))]
      ])

      // TODO: FIX: Cursor briefly flashes when changing style.
      this.nodes.tooltip.style("opacity", this.showTooltip ? 1 : 0)
      this.nodes.tooltip.html(this.valueTable(values))
      this.nodes.tooltip.style("left", `70px`)
      this.nodes.tooltip.style("top", `50px`)
      this.nodes.tooltip.style("border-color", "grey") 
      //this.element.style.cursor = "pointer"
    } else {
      this.nodes.tooltip.style("opacity", 0)
      this.nodes.tooltip.style("pointer-events", "none")
      this.state.focused = null
      //this.element.style.cursor = "auto"
    }
  } 

  mouseClicked(e) {
    if (this.state.focused != null) {
      this.state.selected = this.state.selected.add(this.state.focused)
    } else {
      this.state.selected = new Set()
    }
  }

  mouseLeft(e) {
    this.state.focused = null
  }

}