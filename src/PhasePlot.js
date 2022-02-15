import { Plot } from "./Plot.js"

export class PhasePlot extends Plot {
  constructor(element, dataEmbed, forecasts, vField, opts = {}) {
    super(element, opts, {
      weightColoring: true,
      plotE: null,
      hoverRadius: 30, 
      tRangePlot: null,
      width: 480, 
      height: 480
    })

    this.dataEmbed = dataEmbed
    
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
    this.state.addListener((p, v) => this.stateChanged(p, v))

    this.createBase()
    this.updatePlotT()
    this.updateInteraction()
  }

  createBase() {
    this.nodes.base
      .attr("width", this.width)
      .attr("height", this.height)

    this.nodes.axisX = this.nodes.base.append("g")
    this.nodes.axisY = this.nodes.base.append("g")

    this.nodes.gridLines = this.nodes.base.append("g")

    this.nodes.phaseLines = this.nodes.base.append("g")
      .attr("fill", "none")
      .attr("stroke-linejoin", "round")
      .attr("stroke-linecap", "round") 

    this.nodes.dataPhase = this.nodes.phaseLines.append("g")
    this.nodes.nextsPhase = this.nodes.phaseLines.append("g")
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

    this.nodes.nextsPhase
      .selectAll("path")
      .data(nextsPhase)
      .join("path")
        .attr("d", this.line)
        .attr("stroke", this.weightColoring ? d => this.weightColorScale(d[0].w) : "red")
        .attr("stroke-width", 1)
        .attr("fill", "none")

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

    this.nodes.nextsArrows
      .selectAll("path")
      .data(nextsArrows)
      .join("path")
        .attr("d", this.rawLine)
        .attr("stroke", this.weightColoring ? d => this.weightColorScale(d[1].w) : "red")
        .attr("stroke-width", 1)
        .attr("fill", "none")  

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

  updateInteraction() {

    this.nodes.nextsArrows.selectAll("path")
      .attr("visibility", d => this.checkFocus(d[1].baseT, true) ? 
        "visible" : "hidden")
    
    this.nodes.nextsPhase.selectAll("path")
      .attr("visibility", d => this.checkFocus(d[1].baseT, true) ? 
        "visible" : "hidden")
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