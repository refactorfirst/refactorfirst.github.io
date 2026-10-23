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
//
// Identifier contract: cluster ids, node ids, edge endpoints and weights are
// interpolated UNQUOTED — re-quoting them would break the byte-identical
// lockstep with the Java builder — so every raw identifier is first validated
// against the NestedDotBuilder producer contract: the Java producer
// (HierarchyBuilder + HtmlReport.renderSafeNodeId) only ever emits bare DOT
// tokens — letters, digits and underscores, like `cluster_<hex>`,
// `package_<hex>` or class ids with `.`, `$`, `<`, `>` mapped away — and int
// weights. Anything else (report payloads are untrusted) is dropped rather
// than emitted: a quote, bracket, brace or space in a raw id could break out
// of the token and inject DOT statements. Labels and URLs are different:
// they render inside quoted strings and keep their own escaping
// (escapeDotQuoted) and http(s) gate.

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
 * A producer-shaped bare DOT identifier: the NestedDotBuilder producer contract
 * yields only letters, digits and underscores (Java identifiers with the
 * unsafe characters mapped away, plus the `cluster_<hex>` / `package_<hex>`
 * digests), so anything else cannot be interpolated raw without risking DOT
 * injection. Unicode letters/digits stay in — Java identifiers allow them and
 * the DOT grammar's bare-ID character set covers the UTF-8 bytes.
 */
const DOT_ID = /^[\p{L}\p{Nd}_]+$/u;

/**
 * Whether the value satisfies the producer contract for a raw-interpolated
 * DOT identifier (see DOT_ID): a non-empty string of letters, digits and
 * underscores. Labels and URLs do NOT go through this gate — they are quoted
 * strings and keep their own escaping.
 *
 * @param {*} value - Candidate id from the (untrusted) report payload.
 * @returns {boolean} True when the id may be emitted as a bare DOT token.
 */
function isDotId(value) {
    return typeof value === 'string' && DOT_ID.test(value);
}

/**
 * Synthesizes the nested DOT graph for one hierarchy payload. Untrusted-payload
 * gate: cluster ids, node ids, edge endpoints and weights are validated against
 * the producer contract (isDotId / appendEdges) and out-of-contract entries are
 * dropped rather than emitted; labels and URLs keep their own escaping and
 * http(s) gate.
 *
 * @param {object|null} hierarchy - `{packages, edges}` from the report JSON;
 *   missing, null and empty hierarchies render the bare digraph skeleton.
 * @param {object} [options] - Optional rendering tweaks.
 * @param {string} [options.edgeFontColor] - Graphviz color baked into every
 *   edge's fontcolor so vizdom renders edge labels in that color (used by the
 *   dark palette); omitted/empty keeps vizdom's default black.
 * @returns {string} DOT source for a strict digraph with package clusters.
 */
/** Only http(s) URLs may become links: report payloads are untrusted. */
function httpUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

/** Returns a node's hyperlink target from its source path, or null when unresolvable. */
function nodeHyperlinkUrl(path, repoUrl) {
    if (!path || path === '') return null;
    const url = (repoUrl || '') + path;
    return httpUrl(url) ? url : null;
}

export function hierarchyToDot(hierarchy, options) {
    const repoUrl = options && options.repoUrl ? options.repoUrl : '';
    const edgeFontColor =
        options && typeof options.edgeFontColor === 'string' ? options.edgeFontColor : '';
    const parts = ['strict digraph G {'];
    appendPackages((hierarchy && hierarchy.packages) || [], repoUrl, edgeFontColor, parts);
    appendEdges((hierarchy && hierarchy.edges) || [], edgeFontColor, parts);
    parts.push('}');
    return parts.join('\n');
}

/**
 * Synthesizes the package-map graph's flat DOT: one `shape=ellipse` node per
 * package that participates in at least one relationship (or was selected for
 * removal to break cycles), and the edges carry only the relationship weights —
 * matching the main-branch package map, rendered by vizdom like the class and
 * cycle maps. Break-up packages fill red; removal relationships render red.
 * The full hierarchy stays in refactor-first.json for LLM consumption; only
 * the relationship information renders. Untrusted-payload gate: node ids and
 * edges are validated against the producer contract (isDotId / appendEdges)
 * and out-of-contract entries are dropped rather than emitted; labels and
 * URLs keep their own escaping and http(s) gate.
 *
 * @param {object|null} hierarchy - `{packages, edges}` from the report JSON;
 *   missing, null and empty hierarchies render the bare skeleton.
 * @param {object} [options] - Optional rendering tweaks.
 * @param {string} [options.edgeFontColor] - Graphviz color baked into every
 *   edge's fontcolor (used by the dark palette).
 * @returns {string} DOT source for a strict digraph of ellipse package nodes.
 */
export function packageHierarchyToDot(hierarchy, options) {
    const repoUrl = options && options.repoUrl ? options.repoUrl : '';
    const edgeFontColor =
        options && typeof options.edgeFontColor === 'string' ? options.edgeFontColor : '';
    const packages = (hierarchy && hierarchy.packages) || [];
    const edges = (hierarchy && hierarchy.edges) || [];

    const parts = ['strict digraph G {'];
    const appendNodes = pkgs => {
        for (const pkg of pkgs) {
            if (isDotId(pkg && pkg.nodeId)) {
                let line = `${pkg.nodeId} [label="${escapeDotQuoted(pkg.name)}" shape=ellipse`;
                if (pkg.needsBreakUp) line += ' color=red style=filled';
                const url = nodeHyperlinkUrl(pkg.path, repoUrl);
                if (url) line += ` URL="${escapeDotQuoted(url)}" target="_blank"`;
                parts.push(`${line}];`);
            }
            appendNodes((pkg && pkg.children) || []);
        }
    };
    appendNodes(packages);
    appendEdges(edges, edgeFontColor, parts);
    parts.push('}');
    return parts.join('\n');
}

/**
 * Appends one package cluster block per entry: label, breakup style, its
 * rectangle node (package map), its class nodes, then its child packages.
 * Packages without a producer-contract cluster id are dropped, subtree
 * included (see appendPackage).
 *
 * @param {Array<object>} packages - Package nodes in render order.
 * @param {string} edgeFontColor - See hierarchyToDot options.
 * @param {string[]} parts - Output accumulator.
 * @returns {void}
 */
function appendPackages(packages, repoUrl, edgeFontColor, parts) {
    for (const pkg of packages) {
        appendPackage(pkg, repoUrl, edgeFontColor, parts);
    }
}

/**
 * Appends one package cluster block (see appendPackages). Untrusted-payload
 * gate: a package without a producer-contract cluster id cannot be named in
 * the raw `subgraph` header, so the whole block — children and classes
 * included — is dropped; rectangle nodes and class nodes whose ids fail the
 * same gate drop their own line only.
 *
 * @param {object} pkg - Package node: name, id, nodeId, renderAsNode,
 *   needsBreakUp, children, classes.
 * @param {string} edgeFontColor - See hierarchyToDot options.
 * @param {string[]} parts - Output accumulator.
 * @returns {void}
 */
function appendPackage(pkg, repoUrl, edgeFontColor, parts) {
    if (!isDotId(pkg && pkg.id)) return;
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
    if (pkg.renderAsNode && isDotId(pkg.nodeId)) {
        let line = `${pkg.nodeId} [label="${escapeDotQuoted(pkg.name)}" shape=rectangle`;
        if (pkg.needsBreakUp) line += ' color=pink style=filled';
        parts.push(`${line}];`);
    }
    for (const cls of pkg.classes || []) {
        if (!isDotId(cls && cls.id)) continue;
        let line = `${cls.id} [`;
        if (cls.label !== cls.id) line += ` label="${escapeDotQuoted(cls.label)}"`;
        line += ' shape=ellipse';
        if (cls.markedForRemoval) line += ' color=red style=filled';
        const url = nodeHyperlinkUrl(cls.path, repoUrl);
        if (url) line += ` URL="${escapeDotQuoted(url)}" target="_blank"`;
        parts.push(`${line}];`);
    }
    appendPackages(pkg.children || [], repoUrl, edgeFontColor, parts);
    parts.push('}');
}

/**
 * Appends the graph's edges after all nodes, keeping the previous emitters'
 * exact attribute format and highlighting removals in red. Shared by both
 * graphs (the nested class/cycle maps and the flat package map). Each edge is
 * validated against the NestedDotBuilder producer contract before emission:
 * both endpoints must be bare DOT ids (isDotId) and the weight a finite
 * number — out-of-contract edges are dropped rather than emitted raw, where a
 * crafted endpoint or weight could break out of the statement and inject DOT.
 *
 * @param {Array<object>} edges - Edge DTOs: source, target, weight,
 *   markedForRemoval.
 * @param {string} edgeFontColor - See hierarchyToDot options.
 * @param {string[]} parts - Output accumulator.
 * @returns {void}
 */
function appendEdges(edges, edgeFontColor, parts) {
    for (const edge of edges) {
        if (
            !edge ||
            !isDotId(edge.source) ||
            !isDotId(edge.target) ||
            !Number.isFinite(edge.weight)
        ) {
            continue;
        }
        let line = `${edge.source} -> ${edge.target} [ label = "${edge.weight}" weight = "${edge.weight}"`;
        if (edge.markedForRemoval) line += ' color = "red"';
        if (edgeFontColor) line += ` fontcolor = "${edgeFontColor}"`;
        parts.push(`${line} ];`);
    }
}
