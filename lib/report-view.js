// Interactive report enhancements ported from the RefactorFirst report
// viewer (RefactorFirst repo, report/src/main/resources/viewer/index.html):
// DOT graph popups (Sigma 2D / ForceGraph 3D), Chart.js bubble charts and
// vizdom WASM graph rendering. All CDN dependencies are optional — any
// failure degrades to the static rendered report.

import { sourceUrl } from './utils.js';
import { hierarchyToDot, packageHierarchyToDot } from './hierarchy-dot.js';

// ---------------------------------------------------------------------------
// DOT exposure: popup buttons in the Mustache template reference globals.
// Each graph's DOT is synthesized client-side from its hierarchy payload
// (vizdom renders it; graphlib-dot flattens the clusters in the 2D/3D popups).
// ---------------------------------------------------------------------------

export function exposeGraphDots(data) {
    // Hyperlinked nodes for every graph: the repository URL from the project
    // metadata flows into each synthesis; the helpers only emit http(s) links.
    const synthesisOptions = {
        ...graphDotOptions(),
        repoUrl: data.project && data.project.repoUrl ? data.project.repoUrl : ''
    };
    if (data.classMap && data.classMap.hierarchy) {
        window.classGraph_dot = hierarchyToDot(data.classMap.hierarchy, synthesisOptions);
    } else if (data.classMap && data.classMap.dot) {
        // Older RefactorFirst reports ship only the raw classMap.dot string,
        // with no hierarchy to synthesize from: the popup path parses DOT
        // directly, so expose the report's own DOT verbatim.
        window.classGraph_dot = data.classMap.dot;
    } else {
        // This report carries no class graph data: drop whatever a previously
        // rendered report left on window so its graph can never be reused
        // for this report's popup.
        delete window.classGraph_dot;
    }
    if (data.packageMap && data.packageMap.hasEdges && data.packageMap.hierarchy) {
        window.packageGraph_dot = packageHierarchyToDot(data.packageMap.hierarchy, synthesisOptions);
    }
    const cycle = data.classCycles && data.classCycles.largestCycle;
    if (cycle && cycle.hierarchy) {
        window[`${cycle.cycleIdentifier}_dot`] = hierarchyToDot(cycle.hierarchy, synthesisOptions);
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
    // graphlib-dot parses subgraphs as compound parents: every named
    // subgraph becomes a node with the contained nodes parented to it (and
    // empty subgraphs are pruned at parse time), so only actual subgraph
    // ids ever have children. Packages are noise in the popups, so drop the
    // subgraph nodes — identified by that parsed metadata, not by the ID
    // prefix, so an ordinary node named cluster_worker survives with its
    // edges — while keeping every node the subgraphs contained and the
    // edges between them.
    const droppedSubgraphs = new Set();
    graphlibGraph.nodes().forEach(node => {
        if (graphlibGraph.children(node).length > 0) {
            droppedSubgraphs.add(node);
            return;
        }
        const attrs = graphlibGraph.node(node);
        graphologyGraph.addNode(node, {
            label: attrs.label || node,
            color: attrs.color,
            size: 5
        });
    });
    graphlibGraph.edges().forEach(edge => {
        if (droppedSubgraphs.has(edge.v) || droppedSubgraphs.has(edge.w)) return;
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

// Hovered-node label box backgrounds per palette. Sigma's default hover
// renderer hardcodes "#FFF", which washes out the light label text the dark
// palette switches to; the dark value is --card-bg in app/globals.css (the
// popup surface), so the box blends into it while keeping >= 4.5:1 against
// CHART_LEGEND_TEXT.dark.
const SIGMA_HOVER_BG = Object.freeze({
    light: '#ffffff',
    dark: '#1a2330'
});

// Hover accents for the canvas/WebGL popup graphs, mirroring the
// --graph-hover-edge/-in/-out custom properties of each palette in
// app/globals.css (the values that style the vizdom SVGs' rf-hover-*
// classes; tests/unit/report-view.test.js guards the two sides against
// drift). CSS cannot reach canvas or WebGL, so the popups resolve accents
// in JS: the 2D sigma popup follows the active palette like the inline
// SVGs (its canvas sits on the themed popup surface), while the 3D
// force-graph popup always paints its own dark WebGL background and
// therefore always uses the dark values. When nothing is highlighted, both
// popups keep the colors the DOT graph itself specifies.
export const GRAPH_HOVER_ACCENTS = Object.freeze({
    light: Object.freeze({edge: '#b45309', in: '#1e8449', out: '#2a6f97'}),
    dark: Object.freeze({edge: '#f0b95a', in: '#7ee2a8', out: '#8ed0fa'})
});

/**
 * Dark-palette counterpart of sigma.js' default hover renderer (upstream
 * drawHover, MIT): identical geometry — a rounded label box trailing a drop
 * shadow, or a shadowed circle when the node has no label — but the box
 * fills with the dark popup surface instead of the hardcoded white, so the
 * light label color stays readable. Canvas-drawn, so CSS cannot reach it.
 *
 * @param {CanvasRenderingContext2D} context - Hover layer canvas context.
 * @param {object} data - Display data (x, y, size, label) of the hovered node.
 * @param {object} settings - Resolved Sigma settings (labelColor, labelFont…).
 * @returns {void}
 */
export function drawDarkHover(context, data, settings) {
    const size = settings.labelSize;
    const font = settings.labelFont;
    const weight = settings.labelWeight;

    context.font = `${weight} ${size}px ${font}`;

    // Label box background in the dark surface color.
    context.fillStyle = SIGMA_HOVER_BG.dark;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;
    context.shadowBlur = 8;
    context.shadowColor = '#000';

    const PADDING = 2;

    if (typeof data.label === 'string') {
        const textWidth = context.measureText(data.label).width;
        const boxWidth = Math.round(textWidth + 5);
        const boxHeight = Math.round(size + 2 * PADDING);
        const radius = Math.max(data.size, size / 2) + PADDING;

        const angleRadian = Math.asin(boxHeight / 2 / radius);
        const xDeltaCoord = Math.sqrt(Math.abs(Math.pow(radius, 2) - Math.pow(boxHeight / 2, 2)));

        context.beginPath();
        context.moveTo(data.x + xDeltaCoord, data.y + boxHeight / 2);
        context.lineTo(data.x + radius + boxWidth, data.y + boxHeight / 2);
        context.lineTo(data.x + radius + boxWidth, data.y - boxHeight / 2);
        context.lineTo(data.x + xDeltaCoord, data.y - boxHeight / 2);
        context.arc(data.x, data.y, radius, angleRadian, -angleRadian);
        context.closePath();
        context.fill();
    } else {
        context.beginPath();
        context.arc(data.x, data.y, data.size + PADDING, 0, Math.PI * 2);
        context.closePath();
        context.fill();
    }

    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;
    context.shadowBlur = 0;

    // Label text in the same themed color sigma's default label renderer
    // uses (settings.labelColor.color), mirroring upstream drawLabel.
    if (data.label) {
        context.fillStyle = settings.labelColor.color;
        context.fillText(data.label, data.x + data.size + 3, data.y + size / 3);
    }
}

/**
 * Sigma settings for a 2D popup graph under the active palette: undefined in
 * light mode (sigma defaults — #000 labels on the #FFF hover box — stay
 * untouched), and in dark mode the chart legend text color for node labels
 * plus the dark hover renderer above. Popups are rebuilt on every open, so
 * resolving at open time suffices; the theme radios sit under the modal
 * overlay while a popup is open.
 *
 * @returns {object|undefined} Partial Sigma settings, or undefined for sigma
 *   to keep its defaults.
 */
export function sigmaPopupSettings() {
    if (activeChartTheme() !== 'dark') return undefined;
    return {
        labelColor: {color: CHART_LEGEND_TEXT.dark},
        hoverRenderer: drawDarkHover
    };
}

export function showPopup(popupId, containerName, dot) {
    const overlay = document.getElementById('overlay');
    const popup = document.getElementById(popupId);
    if (!overlay || !popup) return; // report was torn down / template lacks overlays
    overlay.style.display = 'block';
    popup.style.display = 'block';
    if (window.graphlibDot && window.graphology && window.Sigma) {
        const graph = buildGraphologyGraph(dot);
        const instance = new window.Sigma(graph, document.getElementById(containerName), sigmaPopupSettings());
        bindSigmaHoverHighlight(instance, graph);
    }
}

/**
 * Highlights a hovered sigma popup node's neighborhood with the same
 * directional model as the vizdom SVGs: the hovered node fills with the
 * amber attention accent, its incoming edges and their source nodes fill
 * green, and its outgoing edges and their sink nodes fill blue — a node
 * holding both states is a bidirectional partner and takes the amber
 * accent. The accents resolve from the active palette at popup-open time
 * (canvas-drawn, so CSS cannot reach them; popups are rebuilt on every
 * open, and the theme radios sit under the modal overlay while one is
 * open). "Accent only": the rest of the graph stays untouched, flagged
 * nodes re-render with sigma's highlighted style so their labels show, and
 * flagged edges thicken. Sigma 2.4.0's event model has no edge hover
 * events (edge interactivity arrived in sigma 3), so the 2D popup binds
 * node hover only; the 3D popup carries the edge-hover half.
 *
 * @param {object} sigma - Live Sigma instance (needs on/setSetting/
 *   scheduleRefresh).
 * @param {object} graph - Graphology graph backing the instance (uses its
 *   edges(node) and extremities(edge) APIs when present).
 * @returns {void}
 */
export function bindSigmaHoverHighlight(sigma, graph) {
    if (!sigma || typeof sigma.on !== 'function' || typeof sigma.setSetting !== 'function' || !graph) return;
    const accents = GRAPH_HOVER_ACCENTS[activeChartTheme()] || GRAPH_HOVER_ACCENTS.light;
    const nodeStates = new Map(); // node -> 'focus' | 'in' | 'out' | 'both'
    const edgeStates = new Map(); // edge -> 'in' | 'out'

    const clear = () => {
        nodeStates.clear();
        edgeStates.clear();
    };
    const refresh = () => {
        if (typeof sigma.scheduleRefresh === 'function') sigma.scheduleRefresh();
    };

    sigma.on('enterNode', payload => {
        const node = payload && payload.node;
        if (!node) return;
        // Clear-then-populate so hopping straight from one node to another
        // (leaveNode fires first, but re-entering stays correct either way)
        // never leaves stale members behind.
        clear();
        nodeStates.set(node, 'focus');
        if (typeof graph.edges === 'function') {
            graph.edges(node).forEach(edge => {
                const extremities = typeof graph.extremities === 'function'
                    ? graph.extremities(edge) : [];
                const [source, target] = extremities;
                if (target === node) {
                    edgeStates.set(edge, 'in');
                    if (source !== node) {
                        nodeStates.set(source, nodeStates.get(source) === 'out' ? 'both' : 'in');
                    }
                } else if (source === node) {
                    edgeStates.set(edge, 'out');
                    if (target !== node) {
                        nodeStates.set(target, nodeStates.get(target) === 'in' ? 'both' : 'out');
                    }
                }
            });
        }
        // Scheduled, not synchronous: sigma coalesces per animation frame, so
        // the leave/enter pair of one pointer movement re-renders only once.
        refresh();
    });
    sigma.on('leaveNode', () => {
        if (!nodeStates.size && !edgeStates.size) return;
        clear();
        refresh();
    });
    sigma.setSetting('nodeReducer', (node, data) => {
        const state = nodeStates.get(node);
        if (!state) return data;
        const accent = state === 'in' ? accents.in : state === 'out' ? accents.out : accents.edge;
        return {...data, color: accent, highlighted: true};
    });
    sigma.setSetting('edgeReducer', (edge, data) => {
        const state = edgeStates.get(edge);
        if (!state) return data;
        return {...data, color: accents[state], size: 3};
    });
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
// public/widgets/force-graph-bridge.js (loaded via a native module
// script so bundlers leave the runtime URL alone), which exposes
// window.SpriteText once ready — sharing one three build with the
// force graph itself.
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
    // Packages are noise in the popups: drop the subgraph nodes graphlib-dot
    // creates per named subgraph, keeping every node they contained and the
    // edges between the kept nodes. Subgraphs are identified by parsed
    // metadata — a node is a subgraph iff contained nodes are parented to
    // it — not by the ID prefix, so an ordinary node named cluster_worker
    // survives with its edges.
    const droppedSubgraphs = new Set();
    graphlibGraph.nodes().forEach(node => {
        if (graphlibGraph.children(node).length > 0) {
            droppedSubgraphs.add(node);
            return;
        }
        nodes.push({
            id: node,
            label: graphlibGraph.node(node).label || node,
            color: graphlibGraph.node(node).color || 'white',
            neighbors: [],
            links: []
        });
    });
    graphlibGraph.edges().forEach(edge => {
        if (droppedSubgraphs.has(edge.v) || droppedSubgraphs.has(edge.w)) return;
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
        // Resolved endpoint objects ride on each link so the hover handlers
        // below never depend on force-graph's ingestion-time rewiring of
        // link.source/link.target from ids into node references.
        link.sourceNode = a;
        link.targetNode = b;
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
        // The same directional hover model as the vizdom SVGs, always on:
        // hovering a node fills it amber while its incoming links and
        // sources go green and its outgoing links and sinks go blue (a
        // both-directions partner takes amber); hovering a link fills it and
        // both endpoints amber. The accents are always the dark palette
        // values — the WebGL canvas paints its own dark background in every
        // theme — and while nothing is highlighted, the DOT graph's own
        // colors show: each link's DOT color (red removals, white fallback)
        // and each node's DOT color on its sprite label.
        const accents = GRAPH_HOVER_ACCENTS.dark;
        const nodeStates = new Map(); // node -> 'focus' | 'edge' | 'in' | 'out' | 'both'
        const linkStates = new Map(); // link -> 'edge' | 'in' | 'out'
        const spriteByNode = new Map();

        const nodeAccent = node => {
            const state = nodeStates.get(node);
            if (!state) return node.color || 'white';
            return state === 'in' ? accents.in : state === 'out' ? accents.out : accents.edge;
        };
        const clearStates = () => {
            nodeStates.clear();
            linkStates.clear();
        };

        // Sprites recolor only for nodes whose highlight state changed since
        // the previous hover — the previous ∪ current flag set — so the
        // always-on hover stays O(changed) instead of O(all sprites).
        let touchedNodes = new Set();
        const syncSprites = () => {
            const dirty = new Set([...touchedNodes, ...nodeStates.keys()]);
            for (const node of dirty) {
                const sprite = spriteByNode.get(node);
                if (sprite) sprite.color = nodeAccent(node);
            }
            touchedNodes = new Set(nodeStates.keys());
        };
        const updateHighlight = () => {
            syncSprites();
            graph
                .linkColor(graph.linkColor())
                .linkWidth(graph.linkWidth())
                .linkDirectionalParticles(graph.linkDirectionalParticles());
        };

        graph
            .nodeThreeObject(node => {
                let sprite = spriteByNode.get(node);
                if (!sprite) {
                    sprite = new SpriteText(node.label);
                    sprite.material.depthWrite = false;
                    sprite.textHeight = 4;
                    spriteByNode.set(node, sprite);
                }
                sprite.color = nodeAccent(node);
                return sprite;
            })
            .linkColor(link => (linkStates.has(link) ? accents[linkStates.get(link)] : link.color || 'white'))
            .linkWidth(link => (linkStates.has(link) ? 4 : 1))
            .linkDirectionalParticles(link => (linkStates.has(link) ? 4 : 0))
            .linkDirectionalParticleWidth(4)
            .onNodeHover(node => {
                if ((!node && !nodeStates.size) || (node && nodeStates.get(node) === 'focus')) return;
                clearStates();
                if (node) {
                    nodeStates.set(node, 'focus');
                    node.links.forEach(link => {
                        if (link.targetNode === node) {
                            linkStates.set(link, 'in');
                            if (link.sourceNode !== node) {
                                nodeStates.set(link.sourceNode,
                                    nodeStates.get(link.sourceNode) === 'out' ? 'both' : 'in');
                            }
                        } else if (link.sourceNode === node) {
                            linkStates.set(link, 'out');
                            if (link.targetNode !== node) {
                                nodeStates.set(link.targetNode,
                                    nodeStates.get(link.targetNode) === 'in' ? 'both' : 'out');
                            }
                        }
                    });
                }
                updateHighlight();
            })
            .onLinkHover(link => {
                linkStates.clear();
                nodeStates.clear();
                if (link) {
                    linkStates.set(link, 'edge');
                    nodeStates.set(link.sourceNode, 'edge');
                    nodeStates.set(link.targetNode, 'edge');
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
    if (!bubble || typeof bubble.path !== 'string') return null;
    return sourceUrl(repoUrl, bubble.path);
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
                // The constructed repoUrl + path URL wins; a payload url is kept as a
                // legacy fallback when no URL can be constructed, and null only when
                // neither exists (the click/hover handlers still gate on isHttpUrl).
                data: (chartData.bubbles || []).map(b => ({x: b.x, y: b.y, r: b.r, raw: {...b, url: bubbleUrl(b, repoUrl) ?? b.url ?? null}})),
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
 * Synthesis options for the active palette: the dark palette bakes the muted
 * edge-label color into the DOT (vizdom renders labels as fill-only glyph
 * paths at parse time, beyond CSS reach), the light palette keeps vizdom's
 * default black. Only edge labels need that synthesis-time color: node
 * labels sit on white shapes in both palettes and keep the baked black
 * ink in the non-hover state (hovered or focused node labels re-ink to
 * the CSS --graph-hover-on), while cluster labels are recolored by CSS
 * along with their rects (--graph-line on regular clusters,
 * --graph-breakup-line on break-up clusters).
 *
 * @returns {object} Options for hierarchyToDot.
 */
export function graphDotOptions() {
    return {
        edgeFontColor: activeChartTheme() === 'dark' ? CHART_LEGEND_TEXT.dark : ''
    };
}

// Rendered graph entries keyed by container id: `{hierarchy, dot, repoUrl}`.
// A hierarchy entry re-synthesizes its DOT on every redraw (the dark palette
// bakes a different edge-label color), while a legacy entry — an older
// RefactorFirst report with only the raw classMap.dot and no hierarchy to
// synthesize from — re-parses that DOT verbatim, so the report renders
// consistently on both palettes. Entries whose container left the DOM
// (report re-rendered or torn down) are pruned instead of redrawn.
const wasmGraphHierarchies = new Map();

/**
 * Re-renders every live graph so edge labels re-resolve against the newly
 * active palette. Entries whose container left the DOM (report re-rendered
 * or torn down) are pruned instead of redrawn.
 *
 * @returns {void}
 */
function redrawGraphsForTheme() {
    const vizdom = typeof window !== 'undefined' ? window.Vizdom : null;
    if (!vizdom || !vizdom.DotParser) return;
    const parser = new vizdom.DotParser();
    for (const [containerId, entry] of wasmGraphHierarchies) {
        const el = typeof document !== 'undefined' ? document.getElementById(containerId) : null;
        if (!el || !el.isConnected) {
            wasmGraphHierarchies.delete(containerId);
            continue;
        }
        try {
            renderGraphInto(parser, el, containerId, entry);
        } catch (error) {
            console.warn('WASM graph re-render failed:', error);
        }
    }
}

/**
 * Parses the graph's DOT (recolored for the active palette) into the graph
 * container's innerHTML and re-wires pan/zoom on the freshly injected SVG.
 * The entry carries either a hierarchy to synthesize from — the package map
 * renders its flat ellipse DOT, the class and cycle maps their nested
 * cluster DOT, and every node with a source path is hyperlinked through the
 * repository URL (http(s)-gated) — or the report's own raw DOT from legacy
 * reports without a hierarchy, which is parsed verbatim.
 *
 * @param {object} parser - vizdom DotParser instance.
 * @param {Element} el - Graph container element.
 * @param {string} containerId - The container's element id.
 * @param {object} entry - `{hierarchy, dot, repoUrl}`: a hierarchy to
 *   synthesize (with repoUrl for hyperlinks) or a raw DOT fallback.
 * @returns {void}
 */
function renderGraphInto(parser, el, containerId, entry) {
    let dotString;
    if (entry.hierarchy) {
        const synthesis = containerId === 'packageGraph' ? packageHierarchyToDot : hierarchyToDot;
        dotString = synthesis(entry.hierarchy, {...graphDotOptions(), repoUrl: entry.repoUrl || ''});
    } else if (entry.dot) {
        // Legacy RefactorFirst reports ship only the raw classMap.dot with no
        // hierarchy to synthesize from: parse it verbatim — no palette
        // fontcolor is baked in, so it renders the same on every theme.
        dotString = entry.dot;
    } else {
        return;
    }
    const parsed = parser.parse(dotString).to_directed().layout();
    let svg = parsed.to_svg().to_string();
    // vizdom drops the target attribute on hyperlinked nodes; restore new-tab
    // behavior on every encoded anchor, not just the first
    svg = svg.replaceAll('<a href=', '<a target="_blank" href=');
    svg = svg.replace('<svg ', '<svg class="fullscreen-svg" ');
    el.innerHTML = svg;
    bindGraphHoverHighlights(el);
    if (window.svgPanZoom) {
        window.svgPanZoom(`#${containerId} svg`, {zoomEnabled: true, controlIconsEnabled: true});
    }
}

// ---------------------------------------------------------------------------
// DOT-graph hover highlights. vizdom writes every node and edge as a group
// carrying a <title> with the DOT node ids ("TestCase" / "TestCase ->
// TestResult"), so the neighbor model derives from the rendered SVG:
// hovering an edge flags the edge plus both endpoint nodes (the attention
// accent), hovering a node flags its incoming edges + source nodes and its
// outgoing edges + sink nodes in two directional states. The rf-hover-*
// state classes are styled from the palette (globals.css); ids are
// producer-contract word characters, and an edge title that fails to parse
// simply binds no highlight. Node anchors are real tab stops, so keyboard
// focus re-uses the node hover state (SC 2.1.1 parity for the pointer-only
// affordance); edges carry no tab stop — the highlight is a pointer
// courtesy, the relationships stay available in the report tables.
// ---------------------------------------------------------------------------

/** The state classes the hover model toggles on g.node/g.edge groups. */
const GRAPH_HOVER_STATES = ['rf-hover-edge', 'rf-hover-in', 'rf-hover-out', 'rf-hover-focus'];

/**
 * Binds the hover/focus highlight model to the freshly injected graph SVG.
 * The node/edge neighbor map is rebuilt per render — theme redraws
 * re-inject the whole SVG, so the listeners must rebind with it — and every
 * mouseover/focusin recomputes the full state idempotently from scratch, so
 * moving between an edge's curve and arrowhead or between neighboring nodes
 * can never leave stale classes behind.
 *
 * @param {Element} container - Graph container holding the injected SVG.
 * @returns {void}
 */
function bindGraphHoverHighlights(container) {
    const svg = container ? container.querySelector('svg') : null;
    if (!svg) return;

    const nodeIds = new Map();    // g.node group -> DOT node id
    const nodesById = new Map();  // DOT node id -> g.node group
    for (const node of svg.querySelectorAll('g.node')) {
        const title = node.querySelector('title');
        const id = title ? title.textContent.trim() : '';
        if (id) {
            nodeIds.set(node, id);
            nodesById.set(id, node);
        }
    }
    const edges = [];             // {group, source, target} from "Source -> Target"
    for (const group of svg.querySelectorAll('g.edge')) {
        const title = group.querySelector('title');
        const parts = title ? title.textContent.split(' -> ') : [];
        if (parts.length === 2) edges.push({group, source: parts[0], target: parts[1]});
    }

    const flagged = new Set();
    const mark = (element, state) => {
        element.classList.add(state);
        flagged.add(element);
    };
    const markNode = (id, state) => {
        const node = nodesById.get(id);
        if (node) mark(node, state);
    };
    const clear = () => {
        for (const element of flagged) element.classList.remove(...GRAPH_HOVER_STATES);
        flagged.clear();
    };
    const applyFor = target => {
        clear();
        const edgeGroup = target.closest ? target.closest('g.edge') : null;
        if (edgeGroup) {
            const edge = edges.find(entry => entry.group === edgeGroup);
            if (edge) {
                mark(edgeGroup, 'rf-hover-edge');
                markNode(edge.source, 'rf-hover-edge');
                markNode(edge.target, 'rf-hover-edge');
            }
            return;
        }
        const nodeGroup = target.closest ? target.closest('g.node') : null;
        if (!nodeGroup || !nodeIds.has(nodeGroup)) return;
        const id = nodeIds.get(nodeGroup);
        mark(nodeGroup, 'rf-hover-focus');
        for (const edge of edges) {
            if (edge.target === id) {
                mark(edge.group, 'rf-hover-in');
                markNode(edge.source, 'rf-hover-in');
            } else if (edge.source === id) {
                mark(edge.group, 'rf-hover-out');
                markNode(edge.target, 'rf-hover-out');
            }
        }
    };

    svg.addEventListener('mouseover', event => applyFor(event.target));
    svg.addEventListener('mouseleave', clear);
    // Keyboard parity: the hyperlinked node anchors are focusable tab stops.
    svg.addEventListener('focusin', event => applyFor(event.target));
    svg.addEventListener('focusout', clear);
}

export async function initWasmGraphs(data) {
    try {
        const vizdom = window.Vizdom;
        const parser = vizdom && vizdom.DotParser ? new vizdom.DotParser() : null;

        const repoUrl = data.project && data.project.repoUrl ? data.project.repoUrl : '';
        const renderGraph = (containerId, graph) => {
            if (!parser) return;
            const el = document.getElementById(containerId);
            if (!el || !(graph && (graph.hierarchy || graph.dot))) return;
            const entry = {...graph, repoUrl};
            renderGraphInto(parser, el, containerId, entry);
            wasmGraphHierarchies.set(containerId, entry);
        };

        if (data.classMap && !data.classMap.dotThresholdExceeded) {
            // Older RefactorFirst reports ship only the raw classMap.dot
            // string with no hierarchy to synthesize from: render that DOT
            // verbatim, and retain it so theme redraws render the legacy
            // report consistently.
            renderGraph('classGraph', {
                hierarchy: data.classMap.hierarchy,
                dot: data.classMap.hierarchy ? null : data.classMap.dot
            });
        }
        if (data.packageMap
                && !data.packageMap.dotThresholdExceeded
                && data.packageMap.hasEdges
                && data.packageMap.hierarchy) {
            renderGraph('packageGraph', {hierarchy: data.packageMap.hierarchy});
        }
        const cycle = data.classCycles && data.classCycles.largestCycle;
        if (cycle && !cycle.dotThresholdExceeded) {
            renderGraph(cycle.cycleIdentifier, {hierarchy: cycle.hierarchy});
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
 * `options.charts`/`options.graphs` gate the widget-dependent work so the
 * caller can defer it to the widget's readiness callback when the CDN
 * script (Chart.js) or the vizdom wasm has not arrived yet — the report
 * markup itself never waits on them. Both default to true for callers that
 * want the full, best-effort pipeline in one call.
 *
 * @param {Element} root - Rendered report container.
 * @param {object} data - Raw report data used by visual enhancements.
 * @param {object} [options] - Which widget enhancements to run.
 * @param {boolean} [options.charts=true] - Initialize the Chart.js bubble charts.
 * @param {boolean} [options.graphs=true] - Initialize the vizdom WASM graphs.
 * @returns {Promise<void>} Resolves after asynchronous graph setup completes.
 */
export async function enhanceReport(root, data, options = {}) {
  const { charts = true, graphs = true } = options;
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

    if (charts) {
        initDisharmonyCharts(data.disharmonies, data.project && data.project.repoUrl);
    }
    if (graphs) {
        await initWasmGraphs(data);
    }
}
