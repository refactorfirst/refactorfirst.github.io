// Client-side DOT synthesis from the nested package/class hierarchy in
// refactor-first.json (classMap.hierarchy, packageMap.hierarchy,
// classCycles.largestCycle.hierarchy). Mirrors NestedDotBuilder in the
// RefactorFirst report module (Java) — the two render byte-identical DOT and
// must stay in lockstep; the unit tests here mirror NestedDotBuilderTest
// there. The standalone viewer (report/src/main/resources/viewer/index.html)
// carries an inline copy of this module for self-contained use.
//
// Layout contract (why clusters come first): in DOT a node belongs to the
// cluster where it is first defined, so packages are emitted as labelled
// `subgraph cluster_…` blocks containing their class nodes (ellipses) and
// child packages before any edge is declared. Edges then reference the
// pre-resolved node ids and may freely cross cluster borders.
//
// Color contract: classes/edges marked for removal stay red; packages that
// need to be broken up render pink — clusters via `style=filled fillcolor=pink`
// when the package has no node of its own, package-map rectangle nodes via
// `color=pink style=filled` (a pink node inside its own pink box would hide
// the signal). Every cluster declares an explicit fill (white when unflagged)
// because vizdom propagates a styled cluster's fill to its nested cluster
// rects — the explicit white keeps child packages of a pink cluster on their
// normal fill; white is vizdom's default cluster fill, so nothing changes
// visually for unflagged clusters. Node and cluster label glyphs keep vizdom's
// default black:
// shapes default to white fills (probe: cluster rects render
// fill="white" stroke="black"), so labels stay readable on every palette —
// only edge labels sit on the page background, which is why edgeFontColor
// exists (vizdom bakes fontcolor into fill-only glyph paths at parse time,
// unreachable by CSS; the dark palette re-synthesizes with
// fontcolor = CHART_LEGEND_TEXT.dark).

/**
 * Escapes a value for a DOT double-quoted string: backslashes, quotes and
 * line breaks become their DOT escape sequences (mirrors the Java
 * escapeDotQuoted in the report module).
 *
 * @param {*} value - Raw label or name; null/undefined render as empty.
 * @returns {string} DOT-quoted-safe text (without the surrounding quotes).
 */
export function escapeDotQuoted(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
}

/**
 * Synthesizes the nested DOT graph for one hierarchy payload.
 *
 * @param {object|null} hierarchy - `{packages, edges}` from the report JSON;
 *   missing, null and empty hierarchies render the bare digraph skeleton.
 * @param {object} [options] - Optional rendering tweaks.
 * @param {string} [options.edgeFontColor] - Graphviz color baked into every
 *   edge's fontcolor so vizdom renders edge labels in that color (used by the
 *   dark palette); omitted/empty keeps vizdom's default black.
 * @returns {string} DOT source for a strict digraph with package clusters.
 */
export function hierarchyToDot(hierarchy, options) {
    const edgeFontColor =
        options && typeof options.edgeFontColor === 'string' ? options.edgeFontColor : '';
    const parts = ['strict digraph G {'];
    appendPackages((hierarchy && hierarchy.packages) || [], edgeFontColor, parts);
    appendEdges((hierarchy && hierarchy.edges) || [], edgeFontColor, parts);
    parts.push('}');
    return parts.join('\n');
}

/**
 * Synthesizes the package-map graph's compound DOT: packages with children render
 * once as labelled clusters, childless packages render once as filled rectangles,
 * and edges attach to cluster-represented packages through invisible anchor nodes
 * clipped to the cluster borders via {@code ltail}/{@code lhead} under
 * {@code compound=true}. Each package name therefore appears exactly once. The
 * package graph renders through @hpcc-js/wasm-graphviz — the only engine that
 * honors compound cluster edges (vizdom ignores ltail/lhead).
 *
 * @param {object|null} hierarchy - `{packages, edges}` from the report JSON;
 *   missing, null and empty hierarchies render the bare compound skeleton.
 * @param {object} [options] - Optional rendering tweaks.
 * @param {string} [options.edgeFontColor] - Graphviz color baked into every
 *   edge's fontcolor (used by the dark palette).
 * @returns {string} DOT source for a strict compound digraph.
 */
export function packageHierarchyToDot(hierarchy, options) {
    const edgeFontColor =
        options && typeof options.edgeFontColor === 'string' ? options.edgeFontColor : '';
    const packages = (hierarchy && hierarchy.packages) || [];
    const edges = (hierarchy && hierarchy.edges) || [];

    const referencedIds = new Set();
    const byNodeId = new Map();
    for (const edge of edges) {
        referencedIds.add(edge.source);
        referencedIds.add(edge.target);
    }
    const index = pkgs => {
        for (const pkg of pkgs) {
            if (pkg.nodeId) byNodeId.set(pkg.nodeId, pkg);
            index(pkg.children || []);
        }
    };
    index(packages);

    const parts = ['strict digraph G {', 'compound=true;'];
    const appendShape = pkg => {
        if (pkg.renderAsNode) {
            parts.push(`${pkg.nodeId} [label="${escapeDotQuoted(pkg.name)}" shape=rectangle style=filled fillcolor=${pkg.needsBreakUp ? 'pink' : 'white'}];`);
            return;
        }
        parts.push(`subgraph ${pkg.id} {`);
        parts.push(`label="${escapeDotQuoted(pkg.name)}";`);
        parts.push(`style=filled fillcolor=${pkg.needsBreakUp ? 'pink' : 'white'};`);
        if (pkg.nodeId && referencedIds.has(pkg.nodeId)) {
            parts.push(`${pkg.nodeId} [shape=point style=invis];`);
        }
        for (const child of pkg.children || []) appendShape(child);
        parts.push('}');
    };
    for (const pkg of packages) appendShape(pkg);
    for (const edge of edges) {
        let line = `${edge.source} -> ${edge.target} [ label = "${edge.weight}" weight = "${edge.weight}"`;
        if (edge.markedForRemoval) line += ' color = "red"';
        if (edgeFontColor) line += ` fontcolor = "${edgeFontColor}"`;
        const source = byNodeId.get(edge.source);
        if (source && !source.renderAsNode) line += ` ltail = "${source.id}"`;
        const target = byNodeId.get(edge.target);
        if (target && !target.renderAsNode) line += ` lhead = "${target.id}"`;
        parts.push(`${line} ];`);
    }
    parts.push('}');
    return parts.join('\n');
}

/**
 * Appends one package cluster block per entry: label, breakup style, its
 * rectangle node (package map), its class nodes, then its child packages.
 *
 * @param {Array<object>} packages - Package nodes in render order.
 * @param {string} edgeFontColor - See hierarchyToDot options.
 * @param {string[]} parts - Output accumulator.
 * @returns {void}
 */
function appendPackages(packages, edgeFontColor, parts) {
    for (const pkg of packages) {
        appendPackage(pkg, edgeFontColor, parts);
    }
}

/**
 * Appends one package cluster block (see appendPackages).
 *
 * @param {object} pkg - Package node: name, id, nodeId, renderAsNode,
 *   needsBreakUp, children, classes.
 * @param {string} edgeFontColor - See hierarchyToDot options.
 * @param {string[]} parts - Output accumulator.
 * @returns {void}
 */
function appendPackage(pkg, edgeFontColor, parts) {
    parts.push(`subgraph ${pkg.id} {`);
    parts.push(`label="${escapeDotQuoted(pkg.name)}";`);
    // Every cluster declares an explicit fill: vizdom propagates a styled
    // cluster's fill to its nested cluster rects, so unflagged children of a
    // pink break-up cluster must say white explicitly or they would inherit
    // the pink. White is vizdom's default cluster fill, so unflagged clusters
    // look unchanged. In the package map the pink signal belongs to the
    // rectangle node, not its own cluster box.
    if (pkg.needsBreakUp && !pkg.renderAsNode) {
        parts.push('style=filled fillcolor=pink;');
    } else {
        parts.push('style=filled fillcolor=white;');
    }
    if (pkg.renderAsNode) {
        let line = `${pkg.nodeId} [label="${escapeDotQuoted(pkg.name)}" shape=rectangle`;
        if (pkg.needsBreakUp) line += ' color=pink style=filled';
        parts.push(`${line}];`);
    }
    for (const cls of pkg.classes || []) {
        let line = `${cls.id} [`;
        if (cls.label !== cls.id) line += ` label="${escapeDotQuoted(cls.label)}"`;
        line += ' shape=ellipse';
        if (cls.markedForRemoval) line += ' color=red style=filled';
        parts.push(`${line}];`);
    }
    appendPackages(pkg.children || [], edgeFontColor, parts);
    parts.push('}');
}

/**
 * Appends the graph's edges after all clusters, keeping the previous
 * emitters' exact attribute format and highlighting removals in red.
 *
 * @param {Array<object>} edges - Edge DTOs: source, target, weight,
 *   markedForRemoval.
 * @param {string} edgeFontColor - See hierarchyToDot options.
 * @param {string[]} parts - Output accumulator.
 * @returns {void}
 */
function appendEdges(edges, edgeFontColor, parts) {
    for (const edge of edges) {
        let line = `${edge.source} -> ${edge.target} [ label = "${edge.weight}" weight = "${edge.weight}"`;
        if (edge.markedForRemoval) line += ' color = "red"';
        if (edgeFontColor) line += ` fontcolor = "${edgeFontColor}"`;
        parts.push(`${line} ];`);
    }
}
