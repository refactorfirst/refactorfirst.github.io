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
            label: graphlibGraph.node(node).label || node,
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
        .nodeLabel('label')
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
                const sprite = new SpriteText(node.label);
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
// Section navigation ("Report sections" menu). The report is rendered
// asynchronously, so a fragment in the URL (#CLASSMAP, #GOD, ...) has no
// target when the browser tries to scroll at load time; and clicking a menu
// link whose fragment already matches the URL is a native no-op. Scrolling
// is therefore handled explicitly: a delegated listener scrolls the target
// into view and enhanceReport honours the initial fragment after rendering.
// ---------------------------------------------------------------------------

/**
 * Finds a section by its literal fragment ID, then by its decoded ID.
 *
 * @param {string} hash - Fragment including '#'; empty and bare fragments are ignored.
 * @returns {HTMLElement|null} Matching element, or null when no target exists.
 */
function findSectionTarget(hash) {
  if (!hash || hash === '#') return null;
  const fragment = hash.slice(1);
  const literalTarget = document.getElementById(fragment);
  if (literalTarget) return literalTarget;
  let decodedFragment;
  try {
    decodedFragment = decodeURIComponent(fragment);
  } catch {
    return null;
  }
  return document.getElementById(decodedFragment);
}

/**
 * Scrolls to an existing fragment target after the report has rendered.
 *
 * @param {string} hash - URL fragment to resolve; missing targets are ignored.
 * @returns {void}
 */
export function scrollToSectionHash(hash) {
  const target = findSectionTarget(hash);
  if (target) target.scrollIntoView();
}

/**
 * Moves keyboard focus to a section without scrolling again. Adds tabindex=-1
 * when needed so section headings can receive programmatic focus.
 *
 * @param {HTMLElement} target - Section element to focus.
 * @returns {void}
 */
function focusSectionTarget(target) {
  if (!target.hasAttribute('tabindex') && !/^(A|AREA|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) {
    target.setAttribute('tabindex', '-1');
  }
  target.focus({ preventScroll: true });
}

/**
 * Binds one delegated fragment-link listener per root, surviving report rerenders.
 * Unmodified primary clicks on resolved targets update history, scroll and focus
 * the section; other clicks retain the browser's default behavior.
 *
 * @param {Element|Document} [root] - Persistent report container; defaults to document.
 * @returns {void}
 */
export function bindSectionNavLinks(root) {
  const scope = root || document;
  // Delegate on the persistent container: enhanced-table interactions
  // re-render the report with innerHTML, which would drop per-link
  // listeners; one delegated listener survives those swaps. The guard
  // keeps effect re-runs from stacking duplicate listeners.
  const guard = scope === document ? scope.documentElement : scope;
  if (guard.hasAttribute('data-rf-nav-bound')) return;
  guard.setAttribute('data-rf-nav-bound', '');
  scope.addEventListener('click', event => {
    // Only intercept unmodified primary-button clicks that target the
    // current tab; Ctrl/Cmd/Shift clicks must keep their browser defaults
    // (open in new tab/window etc.).
    if (event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = typeof event.target?.closest === 'function'
      ? event.target.closest('a[href^="#"]')
      : null;
    if (!link || (scope !== document && !scope.contains(link))) return;
    const destination = link.getAttribute('target');
    if (destination !== null && destination !== '_self') return;
    const href = link.getAttribute('href');
    const target = findSectionTarget(href);
    if (!target) return; // leave unresolved fragments to default navigation
    event.preventDefault();
    if (window.location.hash !== href) {
      history.pushState(null, '', href);
    }
    target.scrollIntoView();
    focusSectionTarget(target);
  });
}

// ---------------------------------------------------------------------------
// Chart.js bubble charts per disharmony.
// ---------------------------------------------------------------------------

// Legend text colors mirroring --muted-color of each palette in
// app/globals.css. The chart canvas is transparent, so legend text sits on
// --bg-color (#ffffff light / #10161d dark); each value keeps >= 4.5:1
// contrast against its own background (WCAG 1.4.3), which no single color
// can achieve on both.
const CHART_LEGEND_TEXT = Object.freeze({
  light: '#5c6b7a', // 5.5:1 on #ffffff
  dark: '#9fb0c0'   // 8.2:1 on #10161d
});

// U+27F6 LONG RIGHTWARDS ARROW (compart.com/en/unicode/U+27F6): suffixed
// onto every chart axis title so the direction of each axis reads at a
// glance.
const AXIS_ARROW = ' \u27F6';

/**
 * Builds a chart axis title: the (data-provided or fallback) label with the
 * long arrow suffix appended.
 *
 * @param {string} label - Axis label from the report data or the fallback.
 * @returns {string} Label suffixed with U+27F6.
 */
function axisTitle(label) {
  return `${label}${AXIS_ARROW}`;
}

/**
 * Returns 'light' or 'dark' for the active palette, mirroring the pure-CSS
 * selection in app/globals.css: the explicit radios win, the system radio
 * defers to prefers-color-scheme, and anything else is light.
 *
 * @returns {'light'|'dark'} Active palette name.
 */
export function activeChartTheme() {
  const doc = typeof document === 'undefined' ? null : document;
  if (doc) {
    const dark = doc.getElementById('rf-theme-dark');
    const light = doc.getElementById('rf-theme-light');
    if (dark && dark.checked) return 'dark';
    if (light && light.checked) return 'light';
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    try {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    } catch {
      // Media query evaluation unavailable: fall through to light.
    }
  }
  return 'light';
}

/**
 * Legend text color for the currently active theme (>= 4.5:1 against the
 * theme's --bg-color). Resolved at draw time so a redraw picks up theme
 * switches.
 *
 * @returns {string} Hex color for legend item text.
 */
export function resolveLegendTextColor() {
  return CHART_LEGEND_TEXT[activeChartTheme()] || CHART_LEGEND_TEXT.light;
}

// Live Chart.js instances by canvas, so theme changes can redraw the
// canvas-drawn legend text (the palette switch itself is pure CSS).
const bubbleCharts = new Map();

/**
 * Redraws every live bubble chart so legend text re-resolves against the
 * newly active theme. Entries whose canvas left the DOM (report re-rendered
 * or torn down) are destroyed — releasing their Chart.js resources — and
 * pruned instead of redrawn.
 *
 * @returns {void}
 */
function redrawChartsForTheme() {
  for (const [canvas, chart] of bubbleCharts) {
    if (!canvas.isConnected) {
      if (chart && typeof chart.destroy === 'function') chart.destroy();
      bubbleCharts.delete(canvas);
      continue;
    }
    if (chart && typeof chart.update === 'function') chart.update();
  }
}

/**
 * Destroys every live bubble chart and clears the registry. The report
 * component calls this before a payload change replaces the report markup
 * (container.innerHTML), so no Chart.js instance outlives its removed
 * canvas; enhanceReport then builds fresh charts for the new canvases.
 *
 * @returns {void}
 */
export function destroyBubbleCharts() {
  for (const chart of bubbleCharts.values()) {
    if (chart && typeof chart.destroy === 'function') chart.destroy();
  }
  bubbleCharts.clear();
}

// The MediaQueryList for prefers-color-scheme, retained so the listener
// (and the redraw callback it holds) stays reachable for the page lifetime.
let systemThemeMediaQuery = null;

/**
 * Binds one delegated listener redrawing charts on theme changes: the
 * rf-theme radios (components/theme-toggle.jsx) for explicit switches and
 * prefers-color-scheme for the system radio. Idempotent per document.
 *
 * @returns {void}
 */
export function bindThemeChartRedraw() {
  const doc = typeof document === 'undefined' ? null : document;
  if (!doc || doc.documentElement.hasAttribute('data-rf-theme-redraw-bound')) return;
  doc.documentElement.setAttribute('data-rf-theme-redraw-bound', '');
  const redrawForTheme = () => {
    redrawChartsForTheme();
    redrawGraphsForTheme();
  };
  doc.addEventListener('change', event => {
    const target = event.target;
    if (target && target.name === 'rf-theme') redrawForTheme();
  });
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    try {
      // Retain the MediaQueryList and subscribe with the best listener API
      // it exposes: addEventListener, or the deprecated addListener on
      // engines that never grew the modern one.
      systemThemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      if (systemThemeMediaQuery && typeof systemThemeMediaQuery.addEventListener === 'function') {
        systemThemeMediaQuery.addEventListener('change', redrawForTheme);
      } else if (systemThemeMediaQuery && typeof systemThemeMediaQuery.addListener === 'function') {
        systemThemeMediaQuery.addListener(redrawForTheme);
      }
    } catch {
      // Older engines without MQL listeners: explicit radios still redraw.
    }
  }
}

/**
 * Validates an untrusted URL from the report payload before it reaches
 * window.open: only absolute http:/https: URLs pass, so injected schemes
 * (javascript:, data:, file:, …) and malformed values are rejected.
 *
 * @param {*} value - Candidate URL from the fetched report data.
 * @returns {boolean} True when value parses to an http: or https: URL.
 */
export function isHttpUrl(value) {
    if (typeof value !== 'string') return false;
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        return false;
    }
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
}

/**
 * Creates a disharmony bubble chart, replacing any chart on the canvas and
 * registering it for theme redraws. Clicking a bubble with a URL opens its
 * source in a new tab with noopener. Warns and returns if Chart.js is unavailable.
 *
 * @param {HTMLCanvasElement} canvas - Canvas on which to render the chart.
 * @param {string} title - Dataset label displayed in the legend.
 * @param {object} chartData - Report chart data with optional bubbles and axis labels.
 * @param {Array<object>} [chartData.bubbles] - Bubble coordinates, radius, colors,
 *   label, priority, and optional source URL.
 * @param {string} [chartData.xaxisLabel] - Overrides the effort axis label.
 * @param {string} [chartData.yaxisLabel] - Overrides the relative churn axis label.
 * @returns {void}
 */
/**
 * Builds the source-file URL of one chart bubble from the report's repository
 * URL and the bubble's path relative to the project root. The report payload
 * lists only the path; repoUrl is specified once in the project metadata.
 *
 * @param {*} bubble - Raw chart bubble from the report payload.
 * @param {*} repoUrl - Repository URL prefix from the project metadata.
 * @returns {string|null} The combined URL, or null when it cannot be built.
 */
function bubbleUrl(bubble, repoUrl) {
    if (typeof repoUrl !== 'string' || !bubble || typeof bubble.path !== 'string') return null;
    return repoUrl + bubble.path;
}

export function initBubbleChart(canvas, title, chartData, repoUrl) {
    const ChartLib = window.Chart;
    if (!ChartLib) {
        console.warn('Chart.js not loaded');
        return;
    }
    // Chart.js refuses a canvas that still backs a live instance; drop the
    // previous chart (and its registry entry) before re-initializing.
    const previous = bubbleCharts.get(canvas);
    if (previous && typeof previous.destroy === 'function') previous.destroy();
    const chart = new ChartLib(canvas.getContext('2d'), {
        type: 'bubble',
        data: {
            datasets: [{
                label: title,
                data: (chartData.bubbles || []).map(b => ({x: b.x, y: b.y, r: b.r, raw: {...b, url: bubbleUrl(b, repoUrl)}})),
                backgroundColor: (chartData.bubbles || []).map(b => b.color),
                borderColor: (chartData.bubbles || []).map(b => b.borderColor),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            // Clicking a bubble opens the source file the report links it
            // to (disharmonies[].chart.bubbles[].path combined with the
            // project repoUrl) in a new tab, with noopener so the opened page
            // can't reach back into this one.
            onClick: (event, elements, chart) => {
                const hit = elements && elements[0];
                if (!hit || !chart || !chart.data || !chart.data.datasets) return;
                const point = chart.data.datasets[hit.datasetIndex];
                const url = point && point.data && point.data[hit.index] && point.data[hit.index].raw
                    ? point.data[hit.index].raw.url
                    : null;
                // The url comes from the fetched report payload, which is
                // untrusted: only parsed http(s) URLs may reach
                // window.open, so a malicious javascript:/data: value
                // can't execute when the bubble is clicked.
                if (isHttpUrl(url) && typeof window !== 'undefined' && typeof window.open === 'function') {
                    window.open(url, '_blank', 'noopener');
                }
            },
            // Pointer affordance while the cursor is over a bubble — only
            // when the hovered bubble carries a URL the click handler would
            // actually open (isHttpUrl), so the hover hint can never
            // promise a navigation the click refuses to perform.
            onHover: (event, elements, chart) => {
                if (!event || !event.native || !event.native.target) return;
                const hit = elements && elements[0];
                const dataset = hit && chart && chart.data && chart.data.datasets
                    ? chart.data.datasets[hit.datasetIndex]
                    : null;
                const raw = dataset && dataset.data && dataset.data[hit.index]
                    ? dataset.data[hit.index].raw
                    : null;
                event.native.target.style.cursor = hit && isHttpUrl(raw ? raw.url : null)
                    ? 'pointer'
                    : 'default';
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        font: {size: 12},
                        padding: 15,
                        boxWidth: 20,
                        boxHeight: 20,
                        // Chart.js renders each legend item's text from
                        // item.fontColor (plugin.legend.js); labels.color only
                        // feeds the DEFAULT generateLabels, which this chart
                        // overrides below. The color is resolved per draw so
                        // the theme-change redraw (bindThemeChartRedraw)
                        // re-syncs it; each palette's value keeps >= 4.5:1
                        // against its --bg-color (#ffffff light / #10161d
                        // dark), which no single color can do for both.
                        generateLabels: () =>
                            ['High Priority (1)', 'Medium Priority', 'Low Priority (max)'].map((label, i) => ({
                                text: label,
                                fillStyle: ['rgb(235, 64, 52)', 'rgb(137, 119, 74)', 'rgb(39, 174, 96)'][i],
                                strokeStyle: ['rgb(235, 64, 52)', 'rgb(137, 119, 74)', 'rgb(39, 174, 96)'][i],
                                fontColor: resolveLegendTextColor(),
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
                            const lines = [
                                `File: ${raw.label}`,
                                `Priority: ${raw.priority}`,
                                `Effort Rank: ${raw.x}`,
                                `Change Proneness Rank: ${raw.y}`
                            ];
                            // Same gate as the click handler: the prompt
                            // only appears when the url is actually
                            // openable (isHttpUrl), never for scheme-
                            // injected or malformed values.
                            if (isHttpUrl(raw.url)) lines.push('Click to open source file');
                            return lines;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: axisTitle(chartData.xaxisLabel || 'Effort to refactor'),
                        // Scriptable option: re-resolved on every update(),
                        // so the theme-change redraw keeps the axis title
                        // color in sync with the canvas-drawn legend text
                        // (>= 4.5:1 on each palette's --bg-color, which no
                        // single color can achieve for both).
                        color: () => resolveLegendTextColor()
                    },
                    grid: {color: '#e0e0e0'}
                },
                y: {
                    title: {
                        display: true,
                        text: axisTitle(chartData.yaxisLabel || 'Relative churn (impact)'),
                        color: () => resolveLegendTextColor()
                    },
                    grid: {color: '#e0e0e0'}
                }
            }
        }
    });
    bubbleCharts.set(canvas, chart);
}

export function initDisharmonyCharts(disharmonies, repoUrl) {
    (disharmonies || []).forEach(d => {
        const canvas = document.getElementById(`chart_${d.anchorId}`);
        if (canvas && d.chart && d.chart.bubbles) {
            initBubbleChart(canvas, d.title, d.chart, repoUrl);
        }
    });
}

// ---------------------------------------------------------------------------
// vizdom WASM graph rendering (inline, pan/zoom-able SVGs).
// ---------------------------------------------------------------------------

/**
 * Appends a Graphviz `fontcolor` attribute to every edge attribute list in
 * a DOT string so vizdom bakes the label color into the SVG at parse time
 * (the default black is unreadable on the dark palette). Edges that already
 * carry fontcolor are left untouched; node statements have no `->` in the
 * matched segment and are preserved verbatim.
 *
 * @param {string} dot - DOT graph source.
 * @param {string} color - Graphviz color value for edge labels.
 * @returns {string} DOT with fontcolor appended to each labeled edge.
 */
export function withEdgeFontColor(dot, color) {
    if (typeof dot !== 'string' || !color) return dot;
    return dot.replace(/(->[^;[\]{}]*?\[)([^\]]*?)(\s*\])/g, (match, open, attrs, close) => {
        if (/fontcolor\s*=/.test(attrs)) return match;
        return `${open}${attrs} fontcolor = "${color}"${close}`;
    });
}

// Rendered graphs keyed by container id, so a theme switch can re-parse the
// dots with the new palette's edge-label color — vizdom bakes fontcolor into
// the SVG at parse time, so recoloring needs a re-render, like the charts.
const wasmGraphDots = new Map();

/**
 * Re-renders every live WASM graph so edge labels re-resolve against the
 * newly active palette. Entries whose container left the DOM (report
 * re-rendered or torn down) are pruned instead of redrawn.
 *
 * @returns {void}
 */
function redrawGraphsForTheme() {
    const vizdom = typeof window !== 'undefined' ? window.Vizdom : null;
    if (!vizdom || !vizdom.DotParser) return;
    const parser = new vizdom.DotParser();
    for (const [containerId, dotString] of wasmGraphDots) {
        const el = typeof document !== 'undefined' ? document.getElementById(containerId) : null;
        if (!el || !el.isConnected) {
            wasmGraphDots.delete(containerId);
            continue;
        }
        try {
            renderGraphInto(parser, el, containerId, dotString);
        } catch (error) {
            console.warn('WASM graph re-render failed:', error);
        }
    }
}

/**
 * Parses a dot string (recolored for the active palette) into the graph
 * container's innerHTML and re-wires pan/zoom on the freshly injected SVG.
 */
function renderGraphInto(parser, el, containerId, dotString) {
    const themedDot = activeChartTheme() === 'dark'
        ? withEdgeFontColor(dotString, CHART_LEGEND_TEXT.dark)
        : dotString;
    const parsed = parser.parse(themedDot).to_directed().layout();
    const svg = parsed.to_svg().to_string()
        .replace('<svg ', '<svg class="fullscreen-svg" ');
    el.innerHTML = svg;
    if (window.svgPanZoom) {
        window.svgPanZoom(`#${containerId} svg`, {zoomEnabled: true, controlIconsEnabled: true});
    }
}

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
            renderGraphInto(parser, el, containerId, dotString);
            wasmGraphDots.set(containerId, dotString);
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
// Stateful DOM preservation. Table interactions re-render the whole report
// (container.innerHTML = ...), which would destroy the live Chart.js
// instances and vizdom-rendered SVG graphs produced below. Rebuilding them
// per keystroke/page-click is the most expensive work in the report, so the
// caller stashes those nodes before re-rendering and grafts them back into
// the fresh DOM — the JS state rides along with the moved node, and the
// heavy pipeline only runs when the payload itself changes.
// ---------------------------------------------------------------------------

/**
 * Finds an element by its literal id without interpreting it as a CSS selector.
 *
 * @param {Element} root - Root element to search.
 * @param {string} id - Literal element id, which may contain selector punctuation.
 * @returns {Element|null} Matching element, if present.
 */
function findById(root, id) {
  // Element ids come from report data (anchorId/cycleIdentifier) and may
  // contain characters that are invalid in CSS selectors, so match on the
  // id attribute via tree walk instead of querySelector('#...').
  if (root.id === id) return root;
  for (const el of root.querySelectorAll('[id]')) {
    if (el.id === id) return el;
  }
  return null;
}

/**
 * The ids of elements whose content is produced by widget work that must
 * survive table-state re-renders: one canvas per disharmony chart plus the
 * inline DOT-graph containers. Mirrors the guards in initDisharmonyCharts
 * and initWasmGraphs.
 */
export function statefulElementIds(data) {
  const ids = (data.disharmonies || [])
    .filter(d => d.anchorId && d.chart && d.chart.bubbles)
    .map(d => `chart_${d.anchorId}`);
  if (data.classMap && !data.classMap.dotThresholdExceeded) ids.push('classGraph');
  if (data.packageMap && !data.packageMap.dotThresholdExceeded && data.packageMap.hasEdges) {
    ids.push('packageGraph');
  }
  const cycle = data.classCycles && data.classCycles.largestCycle;
  if (cycle && !cycle.dotThresholdExceeded && cycle.cycleIdentifier) {
    ids.push(cycle.cycleIdentifier);
  }
  return ids;
}

/**
 * Detaches nothing but records the live nodes for statefulElementIds(data),
 * to be grafted into the replacement DOM after the re-render. Returns a
 * Map<id, Element>; ids absent from the current tree are simply skipped.
 */
export function stashStatefulDom(root, data) {
  const stash = new Map();
  for (const id of statefulElementIds(data)) {
    const el = findById(root, id);
    if (el) stash.set(id, el);
  }
  return stash;
}

/**
 * Replaces each same-id placeholder in the freshly rendered root with the
 * stashed live node, preserving its widget state. Stashed ids without a
 * placeholder (a smaller template, an error page) are dropped.
 */
export function graftStatefulDom(root, stash) {
  if (!stash) return;
  for (const [id, el] of stash) {
    const placeholder = findById(root, id);
    if (placeholder && placeholder !== el) placeholder.replaceWith(el);
  }
}

// ---------------------------------------------------------------------------
// Entry point called after the report template is rendered into the DOM.
// ---------------------------------------------------------------------------

/**
 * Initializes popup handlers, charts, and WASM graphs for a rendered report.
 * Binds section links and scrolls to the initial URL fragment once per root.
 *
 * @param {Element} root - Rendered report container.
 * @param {object} data - Raw report data used by visual enhancements.
 * @returns {Promise<void>} Resolves after asynchronous graph setup completes.
 */
export async function enhanceReport(root, data) {
  exposeGraphDots(data);

  // Popups are interactive via data attributes (see bindPopupHandlers);
  // globals stay available for compatibility/debugging.
  window.showPopup = showPopup;
  window.hidePopup = hidePopup;
  window.createForceGraph = createForceGraph;
  // Bind once: enhanced tables re-render the report on every interaction,
  // and re-adding the listener each time would leak handlers.
  if (typeof document !== 'undefined' && !document.documentElement.hasAttribute('data-rf-esc-bound')) {
    document.documentElement.setAttribute('data-rf-esc-bound', '');
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') hidePopup();
    });
  }
  // Theme switches are pure CSS, but chart legends are canvas-drawn: bind
  // their redraw once so the legend color keeps >= 4.5:1 in every palette.
  bindThemeChartRedraw();
  bindPopupHandlers(root);

  // Menu links: explicit scrolling because the report renders too late for
  // the browser's own fragment navigation (deep links) and re-clicking the
  // current fragment is otherwise a no-op.
  bindSectionNavLinks(root);
  // Honor a deep-link fragment only on the first enhancement of this
  // report root: later enhanceReport runs (retry, refetch, branch switch)
  // must not yank the user's scroll position back to the fragment.
  const navGuard = root && typeof root.hasAttribute === 'function' ? root : document.documentElement;
  if (!navGuard.hasAttribute('data-rf-nav-scrolled')) {
    navGuard.setAttribute('data-rf-nav-scrolled', '');
    scrollToSectionHash(window.location.hash);
  }

    // Reload the GitHub buttons script so dynamically injected buttons render.
    if (!document.querySelector('script[src*="buttons.github.io"]')) {
        const script = document.createElement('script');
        script.src = 'https://buttons.github.io/buttons.js';
        script.async = true;
        script.defer = true;
        document.body.appendChild(script);
    }

    initDisharmonyCharts(data.disharmonies, data.project && data.project.repoUrl);
    await initWasmGraphs(data);
}
