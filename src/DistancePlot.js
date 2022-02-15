import { Plot } from "./Plot.js"

export class DistancePlot extends Plot {
  
  constructor(element, forecasts, vField, opts = {}) {
    super(element, opts, {
      weightColoring: true,
      width: 480, 
      height: 480,
      weightColorFunction: d => "red",
      state: null
    })

    this.forecasts = forecasts
    this.vField = vField

    this.state.addListener((p, v) => this.stateChanged(p, v))

    try {
      this.setDefaults()
      this.createBase()
      this.updatePlotT()
    } catch(error) {
      console.error(error)
      this.plotFail()
    }


    this.element.append(this.nodes.base.node())
  }

  setDefaults() {
    this.tp = d3.extent(this.forecasts, d => d.tp)[1]
    this.tRange = d3.extent(this.forecasts, d => d.baseT)
  }

  createBase() {
    this.nodes.base
      .attr("width", this.width)
      .attr("height", this.height)
      .on("click", _ => {
        this.state.selected = new Set()
      })
      .on("mouseleave", (e,d) => {
        this.state.focused = null
      })
      

    this.nodes.gridLines = this.nodes.base.append("g")
      .attr("id", "gridlines")

    this.nodes.axisX = this.nodes.base.append("g")   
      .attr("id", "axisX")   
    this.nodes.axisY = this.nodes.base.append("g")
      .attr("id", "axisX")  

    this.nodes.bars = this.nodes.base.append("g")
      .attr("id", "bars")

    this.nodes.meanLine = this.nodes.base.append("g")
      .attr("id", "meanLine")

    // Dynamic state
    this.state.defineProperty("selected", new Set())
    this.state.defineProperty("focused", null)
    this.state.defineProperty("plotT", this.tRange[1])    
    this.state.defineProperty("plotTp", this.tp)
    this.state.addListener((p, v) => this.stateChanged(p, v))
  }

  updatePlotT() {
    this.neighbors = [...this.forecasts.find(d => d.baseT == this.state.plotT 
      && d.tp == this.state.plotTp).neighbors]
    this.neighbors.sort((a, b) => a.t - b.t)

    const allPastNeighbors = []
    const pastForecasts =this.forecasts.filter(d => d.baseT < this.state.plotT
      && d.tp == this.state.plotTp)

    for (const pastForecast of pastForecasts) {
      for (const pastNeighbor of pastForecast.neighbors) {
        allPastNeighbors.push(pastNeighbor)
      }
    }

    const meanDistance = d3.mean(allPastNeighbors, d => d.distance)

    this.scaleX = d3.scaleBand()
      .domain(this.neighbors.map(d => d.t))
      .rangeRound([this.margin.left, this.width - this.margin.right])
      .paddingInner(0.2)
      .paddingOuter(0.2)

    const yExtent = d3.extent(this.neighbors, d => d.distance)
    yExtent[0] = 0
    yExtent[1] = Math.max(yExtent[1], meanDistance + meanDistance*0.05)
    this.scaleY = d3.scaleLinear()
      .domain(yExtent)
      .range([this.height - this.margin.bottom, this.margin.top])

    this.nodes.axisX.attr("transform",  `translate(0, ${this.height - this.margin.bottom})`)
    this.nodes.axisX.call(d3.axisBottom(this.scaleX))

    this.nodes.axisX.selectAll("path")
      .style("visibility", "hidden")

    this.nodes.axisX.select("#label").remove()
    this.nodes.axisX.append("text")
      .attr("id", "label")
      .attr("class", "plot-label")
      .text("t")
      .attr("text-anchor", "middle")
      .attr("fill", "currentColor")
      .attr("transform", `translate(${this.width / 2}, ${this.margin.bottom})`)

    this.createAxisLeft(this.nodes.axisY, this.scaleY, "distance")  

    this.nodes.bars
      .selectAll("rect")
      .data(this.neighbors)
      .join("rect")
        .attr("id", d => `neighbor-${d.t}`)
        .attr("x", d => this.scaleX(d.t))
        .attr("y", d => this.scaleY(d.distance))
        .attr("width", this.scaleX.bandwidth())
        .attr("height", d => this.scaleY.range()[0] - this.scaleY(d.distance))
        .attr("fill", d => this.weightColorFunction(d.w))
        .on("mouseenter", (e,d) => {
          this.state.focused = d.t
          this.element.style.cursor = "pointer"

        })
        .on("mouseleave", (e,d) => {
          this.state.focused = null
          this.element.style.cursor = "default"
        })
        .on("click", (e, d) => {
          e.stopPropagation()
          this.state.selected.add(d.t)
        })


    this.nodes.meanLine.selectAll("*").remove()

    this.nodes.meanLine
      .append("path")
        .attr("d",  d3.line()([
          [this.scaleX.range()[0], this.scaleY(meanDistance)], 
          [this.scaleX.range()[1], this.scaleY(meanDistance)]
        ]))
        .attr("stroke", "darkred")
        .attr("stroke-dasharray", "3,2")
  }

  updateInteraction() {
    const colorFunction = d => !this.state.focused || this.state.focused == d.t || this.state.selected.has(d.t)?
      (this.weightColoring ? this.weightColorFunction(d.w) : "red") : "lightgrey"

    this.nodes.bars.selectAll("rect")
      .attr("fill", colorFunction)
  }

  setWeightColoring(weightColoring) {
    this.weightColoring = weightColoring
    this.updateInteraction()
  }

  stateChanged(property, value) {
    if (property == "plotT" || property == "plotTp") {
      this.updatePlotT()
    }
    this.updateInteraction()
  }
}