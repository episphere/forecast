import { Plot } from "./Plot.js"
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm"
import { delayEmbed } from "./forecast.js"

/**
 * The phase space plot.
 */
export class PhasePlot extends Plot {
  /**
   * @param {Element} element HTML element
   * @param {object[]} data The data, in the same format as the forecast.simplex function
   * @param {object[]} forecasts The forecasts, as output by the forecast.simplex function
   * @param {string} vField Name of the value field
   * @param {number} opts.plotE
   * @param {boolean} opts.weightColoring
   * @param {number} opts.hoverRadius
   * @param {number[]} opts.tRangePlot
   * @param {number} opts.width
   * @param {number} opts.height
   */
  constructor(element, data, forecasts, vField, opts = {}) {
    super(element, opts, {
      weightColoring: true,
      plotE: null,
      hoverRadius: 30, 
      tRangePlot: null,
      width: 480, 
      height: 480
    })

    this.data = data 
    this.dataEmbed = delayEmbed(data, [vField], forecasts[0].E)
    
    this.vField = vField

    this.weightColorScale = d3.scaleSequential([0, 1], d3.interpolateReds)

    try {
      this.updateForecasts(forecasts)
    } catch(error) {
      this.plotFail()
    }
    
    this.element.append(this.nodes.base.node())
  }

  setDefaults() {
    this.tRange = d3.extent(this.forecasts, d => d.baseT)
    if (this.tRangePlot == null) {
      this.tRangePlot = this.tRange
    }
    if (this.plotE == null) {
      this.plotE = this.dataEmbed[0].embed.length 
    }

    this.selects = {
      next: d3.select()
    }
  }

  updateForecasts(forecasts) {
    this.forecasts = forecasts
    this.tp = d3.extent(this.forecasts, d => d.tp)[1]

    this.setDefaults()

    // Dynamic state
    this.state.defineProperty("selected", new Set())
    this.state.defineProperty("focused", null)
    this.state.defineProperty("plotT", this.tRange[1])    
    this.state.defineProperty("plotTp", this.tp)
    this.state.defineProperty("disabled", new Set())
    this.state.addListener((p, v) => this.stateChanged(p, v))

    this.createBase()
    this.updatePlotT()
    this.updateInteraction()
  }

  createBase() {
    this.nodes.base
      .attr("width", this.width)
      .attr("height", this.height)

    const clipPath = this.nodes.base.append("clipPath")
      .attr("id", `${this.id}-clip`)
    clipPath.append("rect")
      .attr("x", this.margin.left)
      .attr("y", this.margin.top)
      .attr("width", this.width - this.margin.right - this.margin.left)
      .attr("height", this.height - this.margin.bottom - this.margin.top)

    this.nodes.axisX = this.nodes.base.append("g")
    this.nodes.axisY = this.nodes.base.append("g")

    this.nodes.gridLines = this.nodes.base.append("g")

    this.nodes.phaseLines = this.nodes.base.append("g")
      .attr("fill", "none")
      .attr("stroke-linejoin", "round")
      .attr("stroke-linecap", "round") 
      .attr("clip-path", `url(#${this.id}-clip)`)

      // this.nodes.phaseLines.append("rect")
      //   .attr("x", 0)
      //   .attr("y", 0)
      //   .attr("width", this.width)
      //   .attr("height", this.height)
      //   .attr("fill", "orange")

    this.nodes.dataPhase = this.nodes.phaseLines.append("g")
    this.nodes.nextsPhase = this.nodes.phaseLines.append("g")
    this.nodes.nexts = this.nodes.phaseLines.append("g")
      .attr("id", `${this.id}-nexts`)
      .attr("stroke-width", 1)
      .attr("fill", "none")
    this.nodes.forecastPhase = this.nodes.phaseLines.append("g")

    this.nodes.dataArrows = this.nodes.phaseLines.append("g")
    this.nodes.nextsArrows = this.nodes.phaseLines.append("g")
    this.nodes.forecastArrows = this.nodes.phaseLines.append("g")


    
    this.nodes.currentPoint = this.nodes.base.append("g")

    this.dataPhase = []
    for (let i = 0; i < this.dataEmbed.length - 1; i++) {
      const d1 = this.dataEmbed[i]
      const d2 = this.dataEmbed[i+1]
      const phaseLine = [d1, d2].map(d => ({
        x: d.embed[d1.embed.length-1],
        y: d.embed[d1.embed.length-this.plotE],
        t: d.t
      }))
      this.dataPhase.push(phaseLine)
    }

  }

  updatePlotT() {
    this.tRangePlot[1] = this.state.plotT

    const allValues = []
    this.forecasts.filter(d => d.t >= this.tRange[0] && d.t <= this.tRange[1]).forEach(d => {
      allValues.push(d.yh)
    })
    this.dataEmbed.filter(d => d.t >= this.tRange[0] && d.t <= this.tRange[1]).forEach(d => {
      allValues.push(d[this.vField])
    })

    this.scaleX = d3.scaleLinear()
      .domain(d3.extent(allValues))
      .range([this.margin.left, this.width - this.margin.right])
      .nice()

    this.scaleY = d3.scaleLinear()
      .domain(d3.extent(allValues))
      .range([this.height - this.margin.bottom, this.margin.top])
      .nice()

    this.createGrid(this.nodes.gridLines, this.scaleX, this.scaleY)

    this.scaleColor = d3.scaleLinear()
      .domain(this.tRange)
      .range(["white", "darkgrey"])

    this.createAxisBottom(this.nodes.axisX, this.scaleX, this.vField + " (t)")
    this.createAxisLeft(this.nodes.axisY, this.scaleY, `${this.vField} (t-${this.plotE})`)

    const nowForecasts = this.forecasts.filter(d => d.baseT == this.state.plotT)

    let neighbors = new Map()
    for (const forecast of nowForecasts) {
      for (const neighbor of forecast.neighbors) {
        neighbors.set(neighbor.t, neighbor)
      }
    }
    neighbors = [...neighbors.values()]

    const nextsPhase = []
    for (const neighbor of neighbors) {
      const nextPhase = []
      for (let tpi = 0; tpi <= this.tp; tpi++) {
        if (neighbor.t + tpi > this.state.plotT) {
          break
        }
        
        const d = this.dataEmbed.find(d => d.t == neighbor.t + tpi)
        nextPhase.push({
          x: d.embed[d.embed.length-1], 
          y: d.embed[d.embed.length-this.plotE], 
          t: d.t,
          w: neighbor.w,
          baseT: neighbor.t
        })
      }
      nextsPhase.push(nextPhase)
    }

    const nextsArrows = []
    for (const nextPhase of nextsPhase) {
      for (let i = 0; i < nextPhase.length-1; i++) {
        const phase1 = nextPhase[i]
        const phase2 = nextPhase[i+1]
  
        const p1 = {...phase1, x: this.scaleX(phase1.x), y: this.scaleY(phase1.y)}
        const p2 = {...phase2, x: this.scaleX(phase2.x), y: this.scaleY(phase2.y)}
  
        nextsArrows.push(this.lineArrowHead([p1, p2], 3, Math.PI/2.4))
      }
    }
    
    const forecastPhase = []
    for (let i = 0; i < nowForecasts.length-1; i++) {
      const d = nowForecasts[i]
      forecastPhase.push({
        x: d.yhVector[d.yhVector.length-1], 
        y: d.yhVector[d.yhVector.length-this.plotE], 
      })
    }

    const forecastArrows = []
    for (let i = 0; i < forecastPhase.length-1; i++) {
      const phase1 = forecastPhase[i]
      const phase2 = forecastPhase[i+1]

      const p1 = {x: this.scaleX(phase1.x), y: this.scaleY(phase1.y)}
      const p2 = {x: this.scaleX(phase2.x), y: this.scaleY(phase2.y)}

      forecastArrows.push(this.lineArrowHead([p1, p2], 3, Math.PI/2.4))
    }

    this.line = d3.line() 
      .x(d => this.scaleX(d.x))
      .y(d => this.scaleY(d.y))

    this.rawLine = d3.line()
      .x(d => d.x)
      .y(d => d.y)

    const rangeDataPhase = 
      this.dataPhase.filter(d => d[1].t >= this.tRangePlot[0] && d[1].t <= this.tRangePlot[1])

    this.nodes.dataPhase
      .selectAll("path")
      .data(rangeDataPhase)
      .join("path")
        .attr("d", this.line)
        .attr("stroke", d => this.scaleColor(d[0].t))
        .attr("stroke-width", 1)
        .attr("fill", "none")

    // this.nodes.nextsPhase
    //   .selectAll("path")
    //   .data(nextsPhase)
    //   .join("path")
    //     .attr("id", d => `${this.id}-nextPhase-${d[0].baseT}`)
    //     .attr("d", this.line)
    //     .attr("stroke", this.weightColoring ? d => this.weightColorScale(d[0].w) : "red")
    //     .attr("stroke-width", 1)
    //     .attr("fill", "none")


    this.nodes.nexts.selectAll("*").remove()
    for (let i = 0; i < nextsPhase.length; i++) {
      const nextPhase = nextsPhase[i]

      const nextArrows = []
      for (let j = 0; j < nextPhase.length-1; j++) {
        const phase1 = nextPhase[j]
        const phase2 = nextPhase[j+1]
  
        const p1 = {...phase1, x: this.scaleX(phase1.x), y: this.scaleY(phase1.y)}
        const p2 = {...phase2, x: this.scaleX(phase2.x), y: this.scaleY(phase2.y)}
  
        nextArrows.push(this.lineArrowHead([p1, p2], 3, Math.PI/2.4))
      }

      const gNext = this.nodes.nexts.append("g")
        .attr("id", `${this.id}-next-${nextPhase[0].baseT}`)
        .datum({baseT: nextPhase[0].baseT, w: nextPhase[0].w})


      const color = this.weightColoring ?this.weightColorScale(nextPhase[0].w) : "red"
      gNext.selectAll("path")
        .data(nextArrows)
        .join("path")
          .attr("class", `${this.id}-next-arrow`)
          .attr("d", this.rawLine)
          .attr("stroke", color)

      gNext.append("path")
        .datum(nextPhase)
          .attr("class", `${this.id}-next-phase`)
          .attr("d", this.line)
          .attr("stroke", color)


    }

    this.nodes.forecastPhase
      .selectAll("path")
      .data([forecastPhase])
      .join("path")
        .attr("d", this.line)
        .attr("stroke", "purple")
        .attr("stroke-width", 1)
        .attr("fill", "none")

    // this.nodes.dataArrows
    //   .selectAll("path")
    //   .data(dataArrows)
    //   .join("path")
    //     .attr("d", this.line)
    //     .attr("stroke", "grey")
    //     .attr("stroke-width", 1)
    //     .attr("fill", "none")

    // this.nodes.nextsArrows
    //   .selectAll("path")
    //   .data(nextsArrows)
    //   .join("path")
    //     .attr("d", this.rawLine)
    //     .attr("stroke", this.weightColoring ? d => this.weightColorScale(d[1].w) : "red")
    //     .attr("stroke-width", 1)
    //     .attr("fill", "none")  

    this.nodes.forecastArrows
      .selectAll("path")
      .data(forecastArrows)
      .join("path")
        .attr("d", this.rawLine)
        .attr("stroke", "purple")
        .attr("stroke-width", 1)
        .attr("fill", "none")  

    this.nodes.currentPoint
      .selectAll("circle")
      .data([rangeDataPhase[rangeDataPhase.length-1][1]])
      .join("circle")
        .attr("cx", d => this.scaleX(d.x))
        .attr("cy", d => this.scaleY(d.y))
        .attr("r", 2)
        .attr("fill", "blue")

    this.updateInteraction()
  }

  updateInteractionOld() {

    this.nodes.nextsArrows.selectAll("path")
      .attr("visibility", d => this.checkFocus(d[1].baseT, true) ? 
        "visible" : "hidden")
      .attr("stroke", this.weightColoring ? d => this.weightColorScale(d[1].w) : "red")
    
    this.nodes.nextsPhase.selectAll("path")
      .attr("visibility", d => this.checkFocus(d[1].baseT, true) ? 
        "visible" : "hidden")
      .attr("stroke", this.weightColoring ? d => this.weightColorScale(d[1].w) : "red")
  }

  updateInteraction() {
    this.selects.next.attr("stroke", "grey")
    // this.selects.nextPhase.attr("stroke", "grey")

    if (this.state.focused) {

      this.selects.next =
        this.nodes.nexts.select(`#${this.id}-next-${this.state.focused}`).raise()

      const data = this.selects.next.data()
      if (data.length > 0) {
        this.selects.next = this.selects.next.selectAll("*")
        this.selects.next.attr("stroke", this.weightColoring ? this.weightColorScale(data[0].w) : "red")
      }
    } else {

      this.selects.next = this.nodes.nexts.selectAll("*")
      this.selects.next.selectAll(`.${this.id}-next-phase`).attr("stroke", 
        d => this.weightColoring ? this.weightColorScale(d[0].w) : "red")
      this.selects.next.selectAll(`.${this.id}-next-arrow`).attr("stroke", 
        d => this.weightColoring ? this.weightColorScale(d[1].w) : "red")
      this.selects.next = this.selects.next.selectAll("*")

      // this.nodes.nexts.selectAll(`.${this.id}-next-arrow`)
      //   .attr("stroke", d => this.weightColoring ? this.weightColorScale(d[1].w) : "red")
      // this.nodes.nexts.selectAll(`.${this.id}-next-phase`)
      //   .attr("stroke", d => this.weightColoring ? this.weightColorScale(d[0].w) : "red")

      // this.selects.next.selectAll("*").selectAll("*")
    }

    // if (this.state.focused) {
    //   this.selects.nextPhase = 
    //     this.nodes.nextsPhase.select(`#${this.id}-nextPhase-${this.state.focused}`)

    //   this.selects.nextPhase.attr("stroke", "red")
    // }
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

  lineArrowHead(line, arrLength = 2, arrAngle = Math.PI / 4) {
    const [p1, p2] = line
    const [x1, y1, x2, y2] = [p1.x, p1.y, p2.x, p2.y]

    const theta = Math.atan2(y1 - y2, x1 - x2)
    
    const baseAngle = theta + Math.PI/2
    const angle = 3 * arrAngle

    const arr = [
      {x: x2 - Math.sin(baseAngle + angle)*arrLength, y: y2 + Math.cos(baseAngle + angle)*arrLength},
      p2,
      {x: x2 - Math.sin(baseAngle-angle)*arrLength, y: y2 + Math.cos(baseAngle-angle)*arrLength}
    ]
    
    arr.forEach(d => d.t = p1.t)
    return arr
  }
}