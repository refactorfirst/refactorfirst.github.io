// Interactive report enhancements ported from the RefactorFirst report
// viewer (RefactorFirst repo, report/src/main/resources/viewer/index.html):
// DOT graph popups (Sigma 2D / ForceGraph 3D), Chart.js bubble charts and
// vizdom WASM graph rendering. All CDN dependencies are optional — any
// failure degrades to the static rendered report.

// ---------------------------------------------------------------------------
// DOT exposure: popup buttons in the Mustache template reference globals.
// ---------------------------------------------------------------------------

export function exposeGraphDots(data) {
    if (data.classMap && data.classMap.dot) {
        window.classGraph_dot = data.classMap.dot;
    }
    if (data.packageMap && data.packageMap.dot) {
        window.packageGraph_dot = data.packageMap.dot;
    }
    if (data.classCycles && data.classCycles.largestCycle && data.classCycles.largestCycle.dot) {
        window[`${data.classCycles.largestCycle.cycleIdentifier}_dot`] =
            data.classCycles.largestCycle.dot;
    }
}

// ---------------------------------------------------------------------------
// Layered (sugiyama-style) layout for Sigma popup graphs.
// ---------------------------------------------------------------------------

function sugiyamaLayout(graph) {
    const layers = [];
    const nodeLevels = {};
    const nodes = graph.nodes();

    function assignLevels() {
        const visited = {};

        function visit(node, level) {
            if (visited[node]) return;
            visited[node] = true;
            nodeLevels[node] = level;
            if (!layers[level]) layers[level] = [];
            layers[level].push(node);
            graph.forEachNeighbor(node, neighbor => visit(neighbor, level + 1));
        }

        nodes.forEach(node => {
            if (!visited[node]) visit(node, 0);
        });
    }

    function reduceCrossings() {
        for (let i = 0; i < layers.length - 1; i++) {
            const layer = layers[i];
            const nextLayer = layers[i + 1];
            const positions = {};
            nextLayer.forEach((node, index) => {
                positions[node] = index;
            });
            layer.sort((a, b) => {
                let aPos = 0, bPos = 0;
                graph.forEachNeighbor(a, neighbor => {
                    aPos += positions[neighbor] || 0;
                });
                graph.forEachNeighbor(b, neighbor => {
                    bPos += positions[neighbor] || 0;
                });
                return aPos - bPos;
            });
        }
    }

    function assignPositions() {
        const yStep = 100;
        const xStep = 2000;
        layers.forEach((layer, level) => {
            const layerWidth = layer.length * xStep;
            const offsetX = ((window.screen.width - 200) - layerWidth) / 2;
            layer.forEach((node, index) => {
                graph.setNodeAttribute(node, 'x', offsetX + index * xStep);
                graph.setNodeAttribute(node, 'y', -level * yStep);
            });
        });
    }

    assignLevels();
    reduceCrossings();
    assignPositions();
}

function buildGraphologyGraph(dot) {
    const graphlibGraph = window.graphlibDot.read(dot);
    const graphologyGraph = new window.graphology.Graph();
    graphlibGraph.nodes().forEach(node => {
        const attrs = graphlibGraph.node(node);
        graphologyGraph.addNode(node, {
            label: attrs.label || node,
            color: attrs.color,
            size: 5
        });
    });
    graphlibGraph.edges().forEach(edge => {
        const attrs = graphlibGraph.edge(edge);
        graphologyGraph.addEdge(edge.v, edge.w, {
            color: attrs.color,
            size: 1,
            type: 'arrow'
        });
    });
    sugiyamaLayout(graphologyGraph);
    return graphologyGraph;
}

// ---------------------------------------------------------------------------
// Popup helpers (referenced by onclick attributes in the report template).
// ---------------------------------------------------------------------------

export function showPopup(popupId, containerName, dot) {
    const overlay = document.getElementById('overlay');
    const popup = document.getElementById(popupId);
    if (!overlay || !popup) return; // report was torn down / template lacks overlays
    overlay.style.display = 'block';
    popup.style.display = 'block';
    if (window.graphlibDot && window.graphology && window.Sigma) {
        const graph = buildGraphologyGraph(dot);
        new window.Sigma(graph, document.getElementById(containerName));
    }
}

export function hidePopup() {
    const overlay = document.getElementById('overlay');
    if (!overlay) return; // report was torn down (shared test DOM / SPA re-render)
    overlay.style.display = 'none';
    for (const popup of document.getElementsByClassName('popup')) {
        popup.style.display = 'none';
    }
    // Clear graph containers to free the previous renderings
    document.querySelectorAll('[id^="graph-container"]').forEach(container => {
        while (container.firstChild) container.removeChild(container.firstChild);
    });
}

// three-spritetext is provided by the module bridge in
// public/widgets/three-spritetext-bridge.js (loaded via a native module
// script so bundlers leave the runtime URL alone), which exposes
// window.SpriteText once ready.
function loadSpriteText() {
    if (window.SpriteText) return Promise.resolve(window.SpriteText);
    return Promise.reject(new Error('three-spritetext widget is not loaded'));
}

export async function createForceGraph(popupId, containerName, dot) {
    const overlay = document.getElementById('overlay');
    const popup = document.getElementById(popupId);
    if (!overlay || !popup) return; // report was torn down / template lacks overlays
    overlay.style.display = 'block';
    popup.style.display = 'block';
    const container = document.getElementById(containerName);
    if (!window.graphlibDot || !window.ForceGraph3D) return;

    const graphlibGraph = window.graphlibDot.read(dot);
    const nodes = [];
    const links = [];
    graphlibGraph.nodes().forEach(node => {
        nodes.push({
            id: node,
            color: graphlibGraph.node(node).color || 'white',
            neighbors: [],
            links: []
        });
    });
    graphlibGraph.edges().forEach(edge => {
        links.push({
            source: edge.v,
            target: edge.w,
            color: graphlibGraph.edge(edge).color || 'white',
            weight: graphlibGraph.edge(edge).weight
        });
    });
    const gData = {nodes, links};
    gData.links.forEach(link => {
        const a = gData.nodes.find(node => node.id === link.source);
        const b = gData.nodes.find(node => node.id === link.target);
        a.neighbors.push(b);
        b.neighbors.push(a);
        a.links.push(link);
        b.links.push(link);
    });

    const graph = new window.ForceGraph3D(container)
        .graphData(gData)
        .nodeLabel('id')
        .width(container.clientWidth)
        .height(container.clientHeight);

    if (gData.links.length + gData.nodes.length < 4000) {
        const SpriteText = await loadSpriteText();
        const highlightNodes = new Set();
        const highlightLinks = new Set();
        let hoverNode = null;

        const updateHighlight = () => {
            graph
                .nodeColor(graph.nodeColor())
                .linkWidth(graph.linkWidth())
                .linkDirectionalParticles(graph.linkDirectionalParticles());
        };

        graph
            .nodeThreeObject(node => {
                const sprite = new SpriteText(node.id);
                sprite.material.depthWrite = false;
                sprite.color = node.color;
                sprite.textHeight = 4;
                return sprite;
            })
            .nodeColor(node =>
                highlightNodes.has(node)
                    ? (node === hoverNode ? 'rgb(255,0,0,1)' : 'rgba(255,160,0,0.8)')
                    : 'rgba(0,255,255,0.6)')
            .linkWidth(link => (highlightLinks.has(link) ? 4 : 1))
            .linkDirectionalParticles(link => (highlightLinks.has(link) ? 4 : 0))
            .linkDirectionalParticleWidth(4)
            .onNodeHover(node => {
                if ((!node && !highlightNodes.size) || (node && hoverNode === node)) return;
                highlightNodes.clear();
                highlightLinks.clear();
                if (node) {
                    highlightNodes.add(node);
                    node.neighbors.forEach(neighbor => highlightNodes.add(neighbor));
                    node.links.forEach(link => highlightLinks.add(link));
                }
                hoverNode = node || null;
                updateHighlight();
            })
            .onLinkHover(link => {
                highlightNodes.clear();
                highlightLinks.clear();
                if (link) {
                    highlightLinks.add(link);
                    highlightNodes.add(link.source);
                    highlightNodes.add(link.target);
                }
                updateHighlight();
            });
    }
}

// ---------------------------------------------------------------------------
// Popup bindings: the template carries only data-* attributes (inline
// handlers are untrusted and stripped by the sanitizer), so handlers are
// attached here after rendering.
// ---------------------------------------------------------------------------

export function bindPopupHandlers(root) {
  const scope = root || document;
  scope.querySelectorAll('[data-popup-2d], [data-popup-3d]').forEach(button => {
    button.addEventListener('click', () => {
      const { popup, container, dotVar } = button.dataset;
      if (!popup || !container || !document.getElementById(popup)) return;
      if (button.hasAttribute('data-popup-3d')) {
        createForceGraph(popup, container, window[dotVar]);
      } else {
        showPopup(popup, container, window[dotVar]);
      }
    });
  });
  scope.querySelectorAll('[data-popup-close]').forEach(closer => {
    closer.addEventListener('click', hidePopup);
  });
}

// ---------------------------------------------------------------------------
// Chart.js bubble charts per disharmony.
// ---------------------------------------------------------------------------

export function initBubbleChart(canvas, title, chartData) {
    const ChartLib = window.Chart;
    if (!ChartLib) {
        console.warn('Chart.js not loaded');
        return;
    }
    new ChartLib(canvas.getContext('2d'), {
        type: 'bubble',
        data: {
            datasets: [{
                label: title,
                data: (chartData.bubbles || []).map(b => ({x: b.x, y: b.y, r: b.r, raw: b})),
                backgroundColor: (chartData.bubbles || []).map(b => b.color),
                borderColor: (chartData.bubbles || []).map(b => b.borderColor),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        font: {size: 12},
                        padding: 15,
                        boxWidth: 20,
                        boxHeight: 20,
                        generateLabels: () =>
                            ['High Priority (1)', 'Medium Priority', 'Low Priority (max)'].map((label, i) => ({
                                text: label,
                                fillStyle: ['rgb(235, 64, 52)', 'rgb(137, 119, 74)', 'rgb(39, 174, 96)'][i],
                                strokeStyle: ['rgb(235, 64, 52)', 'rgb(137, 119, 74)', 'rgb(39, 174, 96)'][i],
                                lineWidth: 1,
                                hidden: false,
                                index: i
                            }))
                    }
                },
                tooltip: {
                    callbacks: {
                        label: context => {
                            const raw = context.raw.raw;
                            return [
                                `File: ${raw.label}`,
                                `Priority: ${raw.priority}`,
                                `Effort Rank: ${raw.x}`,
                                `Change Proneness Rank: ${raw.y}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {display: true, text: chartData.xaxisLabel || 'Effort to refactor'},
                    grid: {color: '#e0e0e0'}
                },
                y: {
                    title: {display: true, text: chartData.yaxisLabel || 'Relative churn (impact)'},
                    grid: {color: '#e0e0e0'}
                }
            }
        }
    });
}

export function initDisharmonyCharts(disharmonies) {
    (disharmonies || []).forEach(d => {
        const canvas = document.getElementById(`chart_${d.anchorId}`);
        if (canvas && d.chart && d.chart.bubbles) {
            initBubbleChart(canvas, d.title, d.chart);
        }
    });
}

// ---------------------------------------------------------------------------
// vizdom WASM graph rendering (inline, pan/zoom-able SVGs).
// ---------------------------------------------------------------------------

export async function initWasmGraphs(data) {
    try {
        // The vizdom WASM module is vendored and initialized by the bridge in
        // public/widgets/vizdom-bridge.js, which exposes window.Vizdom.
        const vizdom = window.Vizdom;
        if (!vizdom || !vizdom.DotParser) return;
        const parser = new vizdom.DotParser();

        const renderGraph = (containerId, dotString) => {
            const el = document.getElementById(containerId);
            if (!el || !dotString) return;
            const parsed = parser.parse(dotString).to_directed().layout();
            const svg = parsed.to_svg().to_string()
                .replace('<svg ', '<svg class="fullscreen-svg" ');
            el.innerHTML = svg;
            if (window.svgPanZoom) {
                window.svgPanZoom(`#${containerId} svg`, {zoomEnabled: true, controlIconsEnabled: true});
            }
        };

        if (data.classMap && !data.classMap.dotThresholdExceeded) {
            renderGraph('classGraph', data.classMap.dot);
        }
        if (data.packageMap && !data.packageMap.dotThresholdExceeded && data.packageMap.hasEdges) {
            renderGraph('packageGraph', data.packageMap.dot);
        }
        const cycle = data.classCycles && data.classCycles.largestCycle;
        if (cycle && !cycle.dotThresholdExceeded) {
            renderGraph(cycle.cycleIdentifier, cycle.dot);
        }
    } catch (error) {
        console.warn('WASM graph layout unavailable:', error);
    }
}

// ---------------------------------------------------------------------------
// Entry point called after the report template is rendered into the DOM.
// ---------------------------------------------------------------------------

export async function enhanceReport(root, data) {
  exposeGraphDots(data);

  // Popups are interactive via data attributes (see bindPopupHandlers);
  // globals stay available for compatibility/debugging.
  window.showPopup = showPopup;
  window.hidePopup = hidePopup;
  window.createForceGraph = createForceGraph;
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') hidePopup();
  });
  bindPopupHandlers(root);

    // Reload the GitHub buttons script so dynamically injected buttons render.
    if (!document.querySelector('script[src*="buttons.github.io"]')) {
        const script = document.createElement('script');
        script.src = 'https://buttons.github.io/buttons.js';
        script.async = true;
        script.defer = true;
        document.body.appendChild(script);
    }

    initDisharmonyCharts(data.disharmonies);
    await initWasmGraphs(data);
}
