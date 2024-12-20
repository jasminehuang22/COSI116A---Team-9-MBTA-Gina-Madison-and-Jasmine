/**
 * your-commute.js
 * 
 * taken from mbtaviz.github.io
 *
 * Copyright 2014 Michael Barry & Brian Card.  MIT open-source lincense.
 *
 * Render the "Your Commute" chart and map-glyph in the following
 * stages:
 *
 * 1. Load the map and station data and do some pre-processing
 * 2. Render the map and add drag listening logic
 * 3. Render the scaffolding for the scatterplot
 * 4. When a drag finishes, render the scatterplot of wait/transit times between chosen stops
 * 5. Set up listener on hash part of URL to change displayed stations when URL changes
 * 6. Add interaction behavior with surrounding text
 *
 * Interaction is added to all elements throughout as they are rendered.
 */



/* 1. Load the map and station data and do some pre-processing
 *************************************************************/
function getCaseInsensitiveKey(obj, key) {
  const lowerCaseKey = key.toLowerCase();
  const foundKey = Object.keys(obj).find(k => k.toLowerCase() === lowerCaseKey);
  return foundKey ? obj[foundKey] : undefined;
}

VIZ.requiresData([
  'json!data/station-network.json',
  'json!data/spider.json',
  'json!data/station-paths.json',
  'json!data/alerts.json',
  'json!data/delaytimes.json',
  'json!data/peak_time_ridership.json',
], true).done(function (network, spider, paths, alerts, delaytimes, peak_time_ridership) {
  "use strict";
  var idToNode = {};
  network.links.forEach(function (link) {
    link.source = network.nodes[link.source];
    link.target = network.nodes[link.target];
    link.source.links = link.source.links || [];
    link.target.links = link.target.links || [];
    link.target.links.splice(0, 0, link);
    link.source.links.splice(0, 0, link);
  });
  network.nodes.forEach(function (data) {
    data.x = spider[data.id][0];
    data.y = spider[data.id][1];
    data.delay_time = delaytimes[data.id];
    data.alert = getCaseInsensitiveKey(alerts, data.links[0].line);
    const ridershipData = peak_time_ridership[data.id];
    if (ridershipData) {
      data.ridership = {
        weekday: ridershipData.weekday || {}, // Add weekday ridership
        weekend: ridershipData.weekend || {}  // Add weekend ridership
      };
    } else {
      // If no ridership data, set to empty
      data.ridership = { weekday: {}, weekend: {} };
    }
    data.line = data.links[0].line;
    idToNode[data.id] = data;
  });





  /* 2. Render the map and add drag listening logic
   *************************************************************/
  var tip = d3.tip()
    .attr('class', 'd3-tip pick2')
    .offset([-100, 0])
    .style("pointer-events", "none")
    .html(function (d) {
      return "<div class='tool-tip'>Station: " + VIZ.fixStationName(d.name) + "<br> Avg. Delay Time: " + Math.round(d.delay_time.average_delay_min) + " mins<br>Most Common Alert: " + d.alert.cause.toLowerCase() + "</div>";
    });
  var mapGlyphSvg = d3.select('.section-pick-two .map').append('svg').call(tip);
  var details = d3.select('.section-pick-two .details');
  var $tip = $(".d3-tip.pick2");
  (function renderMap() {
    var outerWidth = 800;
    var outerHeight = 800;
    var margin = { top: 50, right: 50, bottom: 50, left: 50 };
    var xRange = d3.extent(network.nodes, function (d) { return d.x; });
    var yRange = d3.extent(network.nodes, function (d) { return d.y; });
    var width = outerWidth - margin.left - margin.right,
      height = outerHeight - margin.top - margin.bottom;
    var xScale = width / (xRange[1] - xRange[0]);
    var yScale = height / (yRange[1] - yRange[0]);
    var scale = Math.min(xScale, yScale);
    network.nodes.forEach(function (data) {
      data.pos = [
        (data.x - xRange[0]) * scale,
        (data.y - yRange[0]) * scale
      ];
    });
    var endDotRadius = 0.02 * width;
    var mapGlyph = mapGlyphSvg
      .attr('viewBox', '0 0 ' + outerWidth + ' ' + outerHeight)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .append('g', 'map-container')
      .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    var connections = mapGlyph.selectAll('.connect')
      .data(network.links, function (d) { return (d.source && d.source.id) + '-' + (d.target && d.target.id); });

    // render voronoi polygons around each station on the map glyph so the user only needs to hover close to 
    // the station to select it, instead of needing to hover directly over the station
    var voronoi = d3.voronoi()
      .x(function (d) { return d.pos[0]; })
      .y(function (d) { return d.pos[1]; })
      .extent([[-20, -20], [width + 20, height + 20]]);
    const polygons = voronoi(network.nodes).polygons(); // Compute Voronoi polygons
    network.nodes.forEach((node, i) => {
      node.voronoi = polygons[i]; // Assign the corresponding polygon
    });

    network.nodes.forEach((node, i) => {
      if (!Array.isArray(node.voronoi)) {
        console.warn(`Node ${i} has invalid voronoi:`, node.voronoi);
      }
    });


    // render an arrow to indicate what direction the path is going
    arrow = mapGlyph.append('g').attr('class', 'arrow').append('text').text('←')
      .attr('dx', -14)
      .attr('dy', -3);

    connections
      .enter()
      .append('line')
      .attr('class', function (d) { return 'connect ' + d.source.id + '-' + d.target.id; })
      .merge(connections)
      .attr('x1', function (d) { return d.source.pos[0]; })
      .attr('y1', function (d) { return d.source.pos[1]; })
      .attr('x2', function (d) { return d.target.pos[0]; })
      .attr('y2', function (d) { return d.target.pos[1]; })
      .on('click', function (event, d) {
        console.log("Line clicked:", d);
        const lineId = d.source.links[0].line; // Assuming line ID is part of links
        console.log("Line ID:", lineId);
        displayLineTable(lineId);
      });

    connections
      .attr('x1', function (d) { return d.source.pos[0]; })
      .attr('y1', function (d) { return d.source.pos[1]; })
      .attr('x2', function (d) { return d.target.pos[0]; })
      .attr('y2', function (d) { return d.target.pos[1]; });
    var draggingFrom = null;
    var draggingTo = null;
    var stationContainers = mapGlyph.selectAll('.station-wrapper')
      .data(network.nodes, function (d) { return d.name; })
      .enter()
      .append('g').attr('class', 'station-wrapper draggable')
      .on('click', function (d) {
        // Find the first line the station belongs to
        const lineId = d.links[0]?.line;
        if (lineId) {
          displayLineTable(lineId);
        }
      })
      .on('mouseover', function (d) {
        if (draggingFrom) {
          var path = findPath(draggingFrom.id, d.id);
          if (path) {
            highlightPath(draggingFrom.id, d.id);
            draggingTo = d;
          } else {
            draggingTo = null;
          }
        } else {
          d3.select(this).classed('hover', true);
        }
        showTip(d);
      })
      .on('mouseout', function (d) {
        d3.select(this).classed('hover', false);
        $tip.addClass('out');
        tip.hide(d);
      });
    stationContainers.append('clipPath')
      .attr('id', function (d) { return 'clip-' + d.id; })
      .append("circle")
      .attr('cx', function (d) { return d.pos[0]; })
      .attr('cy', function (d) { return d.pos[1]; })
      .attr('r', 20);
    stationContainers.append('path')
      .attr('class', function (d) { return 'voronoi'; })
      .attr('clip-path', function (d) { return 'url(#clip-' + d.id + ')'; })
      .attr('d', function (d) { return "M" + d.voronoi.join(",") + "Z"; });
    stationContainers.append('circle')
      .attr('class', function (d) { d.circle = this; return 'station middle station-label ' + d.id + ' ' + d.line; })
      .attr('cx', function (d) { return d.pos[0]; })
      .attr('cy', function (d) { return d.pos[1]; })
      .attr('r', 8);

    function showTip(d) {
      tip.show(d, d3.select(d.circle).node());
      $tip.removeClass('out');
      var $circle = $(d.circle);
      var offset = $circle.offset();
      tip.style('top', (offset.top - 100) + 'px');
      tip.style('left', (offset.left - $tip.width() / 2 - 5) + 'px');
    }

    // on mobile, allow a user to just click the start then click the end
    // on desktop allow the full drag and drop experience
    if (VIZ.ios) {
      stationContainers.on('click', function (d) {
        draggingFrom = d;
        dragStart.call(this, d).on('click', function (end) {
          draggingTo = end;
          dragEnd();
          d3.event.stopPropagation();
        });
      });
    } else {
      var drag = d3.drag()
        .on("start", dragStart)
        .on("end", dragEnd);

      stationContainers.call(drag);
    }

    function dragEnd() {
      tip.hide();
      d3.select('body').classed('dragging', false);
      if (draggingTo) {
        render(draggingFrom.id, draggingTo.id);
      }
      draggingFrom = null;
      network.nodes.forEach(function (d) {
        d.voronoi2 = null;
      });
      stationContainers.selectAll('.voronoi2').remove();
    }

    function dragStart(d) {
      /* jshint validthis:true */
      d3.select('body').classed('dragging', true);
      draggingFrom = d;
      displayLineTable(d.line);
      draggingTo = null;
      mapGlyphSvg.selectAll('.start').classed('start', false);
      mapGlyphSvg.selectAll('.stop').classed('stop', false);
      mapGlyphSvg.selectAll('.hover').classed('hover', false);
      mapGlyphSvg.selectAll('.active').classed('active', false);
      d3.selectAll("tr")  // Select all table rows
        .attr("class", function () {
          const currentClass = d3.select(this).attr("class") || ""; // Get current class or initialize to empty string
          return currentClass.replace(/\bactive\b/g, "").trim(); // Remove 'active' class and trim extra spaces
        });

      // pre-load file as they are dragging, hopefully it loads and gets cached when they finish dragging
      // VIZ.requiresData(['json!data/upick2-weekday-rollup-' + draggingFrom.id + '.json']);
      d3.select(this).select('circle').classed('start', true);
      arrow.attr('transform', 'scale(0)');
      var stations = [...new Set(
        paths
          .filter(function (d) {
            return d.includes(draggingFrom.id);
          })
          .flat()
      )].map(function (d) { return idToNode[d]; });

      // when you start dragging, immediately draw voronoi polygons around each valid
      // destination point so the path ends at the point that is closest to the cursor
      stations.map((station, i) => [station, voronoi(stations)[i]])
        .forEach(function (d) {
          d[0].voronoi2 = d[1];
        });

      return mapGlyph.selectAll('.station-wrapper')
        .filter(function (d) { return !!d.voronoi2; })
        .moveToFront()
        .append('path')
        .attr('class', 'voronoi2')
        .attr('d', function (d) { return "M" + d.voronoi2.join(",") + "Z"; });
    }

    function displayLineTable(lineId) {
      // Clear existing table content
      d3.select("#line-table-container").html("");

      // Filter nodes for the selected line
      const lineStations = network.nodes.filter(node =>
        node.links.some(link => link.line === lineId)
      );

      if (!lineStations.length) {
        console.warn("No stations found for line:", lineId);
        return;
      }

      // Line-specific colors
      const lineColors = {
        green: "#4CAF50", // Green Line
        red: "#F44336",   // Red Line
        blue: "#2196F3",  // Blue Line
        orange: "#FF9800" // Orange Line
      };
      const lineColor = lineColors[lineId.toLowerCase()] || "#ccc"; // Default to gray

      // Calculate max riders for scaling color intensity
      const maxRiders = d3.max(lineStations, d =>
        Math.max(d.ridership?.weekday?.overall_average_ons || 0,
          d.ridership?.weekend?.overall_average_ons || 0)
      );

      const riderColor = d3.scaleLinear()
        .domain([0, maxRiders || 1]) // Avoid zero division
        .range(["#E8F5E9", lineColor]);

      // Create the table
      const table = d3.select("#line-table-container")
        .append("table")
        .attr("class", "line-data-table")
        .style("width", "100%")
        .style("border-collapse", "collapse");

      // Add table header
      table.append("thead").append("tr")
        .selectAll("th")
        .data([
          "Station Name", "Avg Weekday Riders", "Weekday Peak Time", "Riders During Weekday Peak",
          "Avg Weekend Riders", "Weekend Peak Time", "Riders During Weekend Peak"
        ])
        .enter()
        .append("th")
        .style("border", "1px solid #ddd")
        .style("padding", "8px")
        .style("background-color", "#f4f4f4")
        .text(d => d);

      // Add table rows
      const tbody = table.append("tbody");

      lineStations.forEach(station => {
        const ridership = station.ridership || { weekday: {}, weekend: {} };

        const row = tbody.append("tr");

        row.attr("station-id", station.id);

        // Station Name
        row.append("td")
          .style("border", "1px solid #ddd")
          .style("padding", "8px")
          .text(VIZ.fixStationName(station.name));

        // Avg Weekday Riders (with heatmap)
        const weekdayRiders = ridership.weekday.overall_average_ons || 0;
        row.append("td")
          .style("border", "1px solid #ddd")
          .style("padding", "8px")
          .style("background-color", riderColor(weekdayRiders))
          .text(Math.round(weekdayRiders));

        // Weekday Peak Time
        row.append("td")
          .style("border", "1px solid #ddd")
          .style("padding", "8px")
          .text(ridership.weekday.peak_time || "N/A");

        // Riders During Weekday Peak
        row.append("td")
          .style("border", "1px solid #ddd")
          .style("padding", "8px")
          .text(Math.round(ridership.weekday.peak_time_average_ons || 0));

        // Avg Weekend Riders (with heatmap)
        const weekendRiders = ridership.weekend.overall_average_ons || 0;
        row.append("td")
          .style("border", "1px solid #ddd")
          .style("padding", "8px")
          .style("background-color", riderColor(weekendRiders))
          .text(Math.round(weekendRiders));

        // Weekend Peak Time
        row.append("td")
          .style("border", "1px solid #ddd")
          .style("padding", "8px")
          .text(ridership.weekend.peak_time || "N/A");

        // Riders During Weekend Peak
        row.append("td")
          .style("border", "1px solid #ddd")
          .style("padding", "8px")
          .text(Math.round(ridership.weekend.peak_time_average_ons || 0));
      });
    }


    // line color circles
    function dot(id, clazz) {
      mapGlyph.selectAll('circle.' + id)
        .classed(clazz, true)
        .classed('end', true)
        .classed('middle', false)
        .attr('r', Math.max(endDotRadius, 10));
    }
    dot('place-asmnl', "red");
    dot('place-alfcl', "red");
    dot('place-brntn', "red");
    dot('place-wondl', "blue");
    dot('place-bomnl', "blue");
    dot('place-forhl', "orange");
    dot('place-ogmnl', "orange");
    dot('place-lech', "green");
    dot('place-lake', "green");
    dot('place-clmnl', "green");
    dot('place-river', "green");
    dot('place-hsmnl', "green");


  }());
  var lines = mapGlyphSvg.selectAll('line');
  var circles = mapGlyphSvg.selectAll('circle');

  // if a path exists from start to finish station, return the stations that are along that path
  function findPath(startId, finishId) {
    if (startId === finishId) { return null; }
    for (var i = 0; i < paths.length; i++) {
      var startIdx = paths[i].indexOf(startId);
      var finishIdx = paths[i].indexOf(finishId);
      if (startIdx >= 0 && finishIdx >= 0) {
        return Object.fromEntries(
          d3.range(Math.min(startIdx, finishIdx), Math.max(startIdx, finishIdx) + 1).map(createPair)
        );
      }
    }

    function createPair(idx) {
      return [paths[i][idx], true];
    }
    return null;
  }

  // highlight the path from a starting station to an ending station if one exists
  function highlightPath(from, to) {
    var path = findPath(from, to);
    if (path) {
      details.text(VIZ.fixStationName(idToNode[from].name) + ' to ' + VIZ.fixStationName(idToNode[to].name));
      circles.attr("class", function (d) {
        const currentClass = d3.select(this).attr("class") || ""; // Get current class or initialize as empty string
        return path[d.id] && !currentClass.includes("active")
          ? currentClass + " active"
          : currentClass;
      });

      d3.selectAll("tr") // Select all table rows
        .attr("class", function () {
          const stationId = d3.select(this).attr("station-id"); // Get the station-id attribute
          const currentClass = d3.select(this).attr("class") || ""; // Handle null class case
          return path[stationId] && !currentClass.includes("active")
            ? currentClass + " active"  // Add 'active' only if not already present
            : currentClass;  // Keep existing class
        });



      circles.classed({
        start: function (d) { return d.id === from; },
        stop: function (d) { return d.id === to; },
        hover: false,
        active: true,
        // active: function (d) {
        //   console.log("Checking active for ID:", d.id, "in path:", path);
        //   return path[d.id]; 
        // }
      });

      lines.classed({
        start: function (d) { return d.source.id === from && path[d.target.id] || d.target.id === from && path[d.source.id]; },
        active: function (d) { return path[d.source.id] && path[d.target.id]; }
      });
      var activeLine = lines.filter(function (d) { return d.source.id === from && path[d.target.id] || d.target.id === from && path[d.source.id]; });
      var activeCircle = circles.filter(function (d) { return d.id === from; });
      var lineY = activeLine.attr('y1') === activeCircle.attr('cy') ? activeLine.attr('y2') : activeLine.attr('y1');
      var lineX = activeLine.attr('x1') === activeCircle.attr('cx') ? activeLine.attr('x2') : activeLine.attr('x1');
      var angle = 180 + (Math.atan2(lineY - activeCircle.attr('cy'), lineX - activeCircle.attr('cx')) * 180 / Math.PI);
      arrow.attr('transform', 'translate(' + activeCircle.attr('cx') + ',' + activeCircle.attr('cy') + ')rotate(' + angle + ')');
    }
  }




  /* 3. Render the scaffolding for the scatterplot
   *************************************************************/
  var margin = { top: 35, right: 60, bottom: 15, left: 40 },
    width = 600 - margin.left - margin.right,
    height = 340 - margin.top - margin.bottom;

  var x = d3.scaleLinear()
    .range([0, width]);

  var y = d3.scaleLinear()
    .range([height, 0]);

  var xAxis = d3.axisBottom()
    .scale(x)
    .tickPadding(6)
    .tickSize(-height)
    .tickFormat(VIZ.hourToAmPm);

  var xAxis2 = d3.axisBottom()
    .scale(x)
    .tickSize(5)
    .tickFormat(VIZ.hourToAmPm);

  var yAxis = d3.axisLeft()
    .scale(y)
    .tickSize(-width)
    .tickFormat(Math.abs)
    .tickPadding(8);

  var yAxis2 = d3.axisLeft()
    .scale(y)
    .tickSize(5);

  var arrow;

  // put the contents inside a clipping rectangle so that no data spills out of the scatterplot
  VIZ.createClipRect('bigPickTwoClipper')
    .attr('y', 0)
    .attr('x', 0)
    .attr('width', width)
    .attr('height', height);

  var scatterplotContainer = d3.select(".pick-two .inner-viz");
  var scatterplotSvg = scatterplotContainer.append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  var layerBelowTheData = scatterplotSvg.append('g').attr('class', 'dimmable');
  var dataLayer = scatterplotSvg.append('g').attr('clip-path', "url(#bigPickTwoClipper)");
  var layerAboveTheData = scatterplotSvg.append('g');

  var title = scatterplotSvg.append('text').attr('class', 'dimmable')
    .attr("x", width / 2)
    .attr('y', -18)
    .attr('text-anchor', 'middle')
    .attr('class', 'h4');
  var subtitle = scatterplotSvg.append('text').attr('class', 'dimmable')
    .attr("x", width / 2)
    .attr('y', -5)
    .attr('text-anchor', 'middle');

  layerAboveTheData.append('rect')
    .attr('width', width)
    .attr('height', height)
    .style('fill', 'white')
    .style('opacity', 0)
    .style('stroke', 'none');

  var topRange = dataLayer.appendOnce('path', 'top range dimmable');
  var topUnder = dataLayer.appendOnce('path', 'top under dimmable');
  var topMedian = dataLayer.appendOnce('path', 'top p50 dimmable');
  var bottomRange = dataLayer.appendOnce('path', 'bottom range dimmable');
  var bottomUnder = dataLayer.appendOnce('path', 'bottom under dimmable');
  var bottomMedian = dataLayer.appendOnce('path', 'bottom p50 dimmable');

  // setup the moving color band keys on the right
  var sideKey = scatterplotSvg.append('g').attr('class', 'dimmable').style('opacity', 0);
  var topKey = sideKey.append('text');
  topKey.append('tspan')
    .attr('x', width + 3)
    .attr('dy', -5)
    .text('middle 80%')
    .classed('light-markup', true);
  topKey.append('tspan')
    .attr('x', width + 3)
    .attr('dy', -10)
    .text('transit time');
  var topKeyMedian = sideKey.append('text')
    .attr('x', width + 8)
    .attr('dy', 3)
    .text('median')
    .classed('light-markup', true);
  var bottomKey = sideKey.append('text');
  bottomKey.append('tspan')
    .attr('x', width + 3)
    .attr('dy', 10)
    .text('middle 80%')
    .classed('light-markup', true);
  bottomKey.append('tspan')
    .attr('x', width + 3)
    .attr('dy', 8)
    .text('wait time');
  var bottomKeyMedian = sideKey.append('text')
    .attr('x', width + 8)
    .attr('dy', 3)
    .text('median')
    .classed('light-markup', true);
  var bottomKeyPath = sideKey.append('path').attr('class', 'key-marker');
  var topKeyPath = sideKey.append('path').attr('class', 'key-marker');

  x.domain([5, 24]);

  layerBelowTheData.append("g")
    .attr("class", "x axis")
    .attr("transform", "translate(0," + height + ")")
    .call(xAxis);
  layerBelowTheData.append("g")
    .attr("class", "x axis bold-ticks")
    .attr("transform", "translate(0," + height + ")")
    .call(xAxis2);
  var yAxisG = layerBelowTheData.append("g")
    .attr("class", "y axis");
  var yAxisG2 = layerBelowTheData.append("g")
    .attr("class", "y axis bold-ticks");
  var zeroMinutesLine = layerAboveTheData.append("line")
    .attr("class", "y axis midpoint")
    .style('opacity', 0);
  yAxisG.append("text")
    .attr("class", "label")
    .attr("transform", "rotate(-90)")
    .attr("y", -35)
    .attr("dy", ".71em")
    .style("text-anchor", "end")
    .text("Trip duration (min)");
  yAxisG.append("text")
    .attr("class", "label")
    .attr("transform", "rotate(-90)")
    .attr("y", -35)
    .attr("x", -height)
    .attr("dy", ".71em")
    .style("text-anchor", "start")
    .text("Minutes between trains");





  /* 4. When a drag finishes, render the scatterplot of wait/transit times between chosen stops
   *************************************************************/
  var lastHour = null;
  var idx = 0;
  var lastFrom = null;
  var lastTo = null;
  function render(from, to) {
    // don't re-render the same thing
    if (lastFrom === from && lastTo === to) { return; }
    lastFrom = from;
    lastTo = to;
    highlightPath(from, to);
    d3.selectAll('.section-pick-two a.anchor').attr('href', ['#your-commute', from, to].join('.'));
    idx = idx + 1;
    var myIdx = idx;
    console.log("from: " + from + " to: " + to);
  }



  /* 5. Set up listener on hash part of URL to change displayed
   *    stations when that changes
   *
   * For example, when URL changes to
   * #your-commute.place-knncl.place-sstat
   * it loads data into the scatterplot from Kendall/MIT to
   * South Station
   *************************************************************/
  // var hashData = VIZ.getHashData();
  // if (hashData && idToNode[hashData[0]] && idToNode[hashData[1]]) {
  //   // if stations are specified in URL, show them
  //   render(hashData[0], hashData[1]);
  // } else {
  //   // if no specific station pair is selected, then start by showing Kendall/MIT to South Station
  //   // because that is the route that Mike rides at 5:30PM
  //   render('place-knncl', 'place-sstat');
  // }

  // Listen for URL hash changes and update the data if that changes after the page is loaded
  $(window).on('hashdatachange', function (evt, d) {
    var hashData = d.data;
    if (hashData.length === 2 && idToNode[hashData[0]] && idToNode[hashData[1]]) {
      render(hashData[0], hashData[1]);
    }
  });



  /* 6. Add interaction behavior with surrounding text
   *************************************************************/
  // Setup the links in text that dim everything except a certain part of the graph on hover
  // <a href="#" data-dest="selector to show" class="pick-two-highlight">...
  d3.selectAll('.section-pick-two a.pick-two-highlight')
    .on('click', function () {
      d3.event.preventDefault();
    })
    .on('mouseover', function () {
      var selector = d3.select(this).attr('data-highlight');
      d3.selectAll('.section-pick-two .viz').selectAll(selector).classed('highlight-active', true);
      d3.selectAll('.section-pick-two .viz').classed('highlighting', true);
    })
    .on('mouseout', function () {
      d3.selectAll('.section-pick-two .viz .highlight-active').classed('highlight-active', false);
      d3.selectAll('.section-pick-two .viz').classed('highlighting', false);
    });

  // Setup the links in text that load data for other station pairs when you click on them
  // <a href="#" data-start="GTFS ID of starting station" data-end="GTFS ID of ending station" class="pick-two-choose">...
  d3.selectAll('.section-pick-two a.pick-two-choose')
    .on('click', function () {
      d3.event.preventDefault();
      var start = d3.select(this).attr('data-start');
      var end = d3.select(this).attr('data-end');
      render(start, end);
    })
    .on('mouseover', function () {
      // start downloading file as soon as user is thinking about clicking the link
      var start = d3.select(this).attr('data-start');
      // VIZ.requiresData(['json!data/upick2-weekday-rollup-' + start + '.json']);
    });





  /* Miscellaneous utilities
   *************************************************************/
  function defined(d) {
    return d[0] && (d[0] < 24.5 && d[0] >= 5);
  }

  function placeMidpointLine(line) {
    line
      .style('opacity', 0.4)
      .attr('x1', -5)
      .attr('x2', width)
      .attr('y1', y(0))
      .attr('y2', y(0));
  }

  function area(num, startIdx, endIdx, neg) {
    var mult = neg ? -1 : 1;
    return d3.area()
      .x(function (d) { return x(d[0]); })
      .curve(d3.curveBasis) // Use curve instead of interpolate
      .defined(defined)
      .y0(function (d) { return y(mult * d[num][startIdx]); })
      .y1(function (d) { return y(mult * d[num][endIdx]); });
  }


  function line(num, idx, neg) {
    var mult = neg ? -1 : 1;
    return d3.line()
      .x(function (d) { return x(d[0]); })
      .curve(d3.curveBasis)
      .defined(defined)
      .y(function (d) { return y(mult * d[num][idx]); });
  }

  function round(input) {
    return input.map(Math.round);
  }
});
