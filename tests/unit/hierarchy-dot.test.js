import { describe, it, expect } from 'bun:test';

import {
  hierarchyToDot,
  packageHierarchyToDot,
  escapeDotQuoted
} from '../../lib/hierarchy-dot.js';

// Mirrors NestedDotBuilderTest in the RefactorFirst report module (Java): the
// client-side synthesis must render the exact DOT the server-side builder
// emits, so the two implementations stay in lockstep. The only extension is the
// edgeFontColor option — vizdom bakes edge-label colors into glyph paths at
// parse time, so the dark palette recolors labels by re-synthesizing the DOT
// (this replaces the retired withEdgeFontColor string rewrite). Every cluster
// declares an explicit fill (pink when flagged, white otherwise) because vizdom
// propagates a styled cluster's fill to its nested cluster rects.

function classNode(fqn, id, label, path, markedForRemoval) {
  return { fqn, id, label, path, markedForRemoval };
}

function packageNode(name, id, overrides = {}) {
  return {
    name,
    id,
    nodeId: null,
    renderAsNode: false,
    needsBreakUp: false,
    children: [],
    classes: [],
    ...overrides
  };
}

describe('hierarchyToDot (nested package clusters)', () => {
  it('nests ellipse class nodes inside labelled package clusters', () => {
    const hierarchy = {
      packages: [
        packageNode('org', 'cluster_org', {
          children: [
            packageNode('org.a', 'cluster_org_a', {
              classes: [classNode('org.a.Alpha', 'Alpha', 'Alpha', '', false)]
            }),
            packageNode('org.b', 'cluster_org_b', {
              classes: [
                classNode('org.b.Beta', 'Beta', 'Beta', '', false),
                classNode('org.b.Gamma', 'Gamma', 'Gamma Label', '', false)
              ]
            })
          ]
        })
      ],
      edges: [{ source: 'Alpha', target: 'Beta', weight: 3, markedForRemoval: false }]
    };

    expect(hierarchyToDot(hierarchy)).toBe(
      'strict digraph G {\n' +
      'subgraph cluster_org {\n' +
      'label="org";\n' +
      'style=filled fillcolor=white;\n' +
      'subgraph cluster_org_a {\n' +
      'label="org.a";\n' +
      'style=filled fillcolor=white;\n' +
      'Alpha [ shape=ellipse];\n' +
      '}\n' +
      'subgraph cluster_org_b {\n' +
      'label="org.b";\n' +
      'style=filled fillcolor=white;\n' +
      'Beta [ shape=ellipse];\n' +
      'Gamma [ label="Gamma Label" shape=ellipse];\n' +
      '}\n' +
      '}\n' +
      'Alpha -> Beta [ label = "3" weight = "3" ];\n' +
      '}'
    );
  });

  it('keeps marked classes red and fills break-up package clusters pink', () => {
    const hierarchy = {
      packages: [
        packageNode('p', 'cluster_p', {
          children: [
            packageNode('p.a', 'cluster_pa', {
              needsBreakUp: true,
              classes: [
                classNode('p.a.A', 'A', 'A', '', true),
                classNode('p.a.B', 'B', 'B', '', false)
              ]
            }),
            packageNode('p.b', 'cluster_pb')
          ]
        })
      ],
      edges: []
    };

    expect(hierarchyToDot(hierarchy)).toBe(
      'strict digraph G {\n' +
      'subgraph cluster_p {\n' +
      'label="p";\n' +
      'style=filled fillcolor=white;\n' +
      'subgraph cluster_pa {\n' +
      'label="p.a";\n' +
      'style=filled fillcolor=pink;\n' +
      'A [ shape=ellipse color=red style=filled];\n' +
      'B [ shape=ellipse];\n' +
      '}\n' +
      'subgraph cluster_pb {\n' +
      'label="p.b";\n' +
      'style=filled fillcolor=white;\n' +
      '}\n' +
      '}\n' +
      '}'
    );
  });

  it('renders package-map participants as pink-capable rectangle nodes', () => {
    const hierarchy = {
      packages: [
        packageNode('org.hjug', 'cluster_hjug', {
          nodeId: 'package_hjug',
          renderAsNode: true,
          children: [
            packageNode('org.hjug.cbc', 'cluster_cbc', {
              nodeId: 'package_cbc',
              renderAsNode: true,
              needsBreakUp: true
            }),
            packageNode('org.hjug.dsm', 'cluster_dsm', {
              nodeId: 'package_dsm',
              renderAsNode: true
            })
          ]
        })
      ],
      edges: [{ source: 'package_cbc', target: 'package_dsm', weight: 4, markedForRemoval: false }]
    };

    expect(hierarchyToDot(hierarchy)).toBe(
      'strict digraph G {\n' +
      'subgraph cluster_hjug {\n' +
      'label="org.hjug";\n' +
      'style=filled fillcolor=white;\n' +
      'package_hjug [label="org.hjug" shape=rectangle];\n' +
      'subgraph cluster_cbc {\n' +
      'label="org.hjug.cbc";\n' +
      'style=filled fillcolor=white;\n' +
      'package_cbc [label="org.hjug.cbc" shape=rectangle color=pink style=filled];\n' +
      '}\n' +
      'subgraph cluster_dsm {\n' +
      'label="org.hjug.dsm";\n' +
      'style=filled fillcolor=white;\n' +
      'package_dsm [label="org.hjug.dsm" shape=rectangle];\n' +
      '}\n' +
      '}\n' +
      'package_cbc -> package_dsm [ label = "4" weight = "4" ];\n' +
      '}'
    );
  });

  it('hyperlinks class nodes with a path when the repository URL resolves to http(s)', () => {
    const hierarchy = {
      packages: [
        packageNode('(default package)', 'cluster_default', {
          classes: [
            classNode('A', 'A', 'A', 'src/main/java/A.java', false),
            classNode('B', 'B', 'B', '', false)
          ]
        })
      ],
      edges: []
    };

    const withRepoUrl = hierarchyToDot(hierarchy, { repoUrl: 'https://github.com/x/y/blob/main/' });
    expect(withRepoUrl).toContain(
      'A [ shape=ellipse URL="https://github.com/x/y/blob/main/src/main/java/A.java" target="_blank"]');
    expect(withRepoUrl).not.toContain('URL="https://github.com/x/y/blob/main/"');
    expect(hierarchyToDot(hierarchy)).not.toContain('URL=');
    expect(hierarchyToDot(hierarchy, { repoUrl: 'javascript:alert(1)/' })).not.toContain('URL=');
  });

  it('escapes package names and labels; $ stays literal', () => {
    const hierarchy = {
      packages: [
        packageNode('com."weird"\\name', 'cluster_evil', {
          classes: [
            classNode('Widget.<anonymous>', 'Widget_anonymous', 'Widget$anonymous', '', false),
            classNode('Anon', 'Anon', 'line1\nline2', '', false)
          ]
        })
      ],
      edges: []
    };

    expect(hierarchyToDot(hierarchy)).toBe(
      'strict digraph G {\n' +
      'subgraph cluster_evil {\n' +
      'label="com.\\"weird\\"\\\\name";\n' +
      'style=filled fillcolor=white;\n' +
      'Widget_anonymous [ label="Widget$anonymous" shape=ellipse];\n' +
      'Anon [ label="line1\\nline2" shape=ellipse];\n' +
      '}\n' +
      '}'
    );
  });

  it('renders empty, null and undefined hierarchies as a bare digraph', () => {
    const bare = 'strict digraph G {\n}';
    expect(hierarchyToDot({ packages: [], edges: [] })).toBe(bare);
    expect(hierarchyToDot(null)).toBe(bare);
    expect(hierarchyToDot(undefined)).toBe(bare);
  });

  it('tolerates packages with missing children or classes arrays', () => {
    const hierarchy = { packages: [{ name: 'org', id: 'cluster_org' }], edges: [] };
    expect(hierarchyToDot(hierarchy)).toBe(
      'strict digraph G {\n' +
      'subgraph cluster_org {\n' +
      'label="org";\n' +
      'style=filled fillcolor=white;\n' +
      '}\n' +
      '}'
    );
  });

  it('fills child clusters white inside a pink parent cluster', () => {
    // Mirrors the Java NestedDotBuilderTest: vizdom propagates a styled
    // cluster's fill to nested cluster rects, so unflagged children of a
    // pink break-up cluster must declare their white fill explicitly.
    const hierarchy = {
      packages: [
        packageNode('org.hjug', 'cluster_hjug', {
          children: [
            packageNode('org.hjug.graphbuilder', 'cluster_gb', {
              needsBreakUp: true,
              children: [
                packageNode('org.hjug.graphbuilder.metrics', 'cluster_metrics', {
                  classes: [classNode('org.hjug.graphbuilder.metrics.Detector', 'Detector', 'Detector', '', false)]
                }),
                packageNode('org.hjug.graphbuilder.visitor', 'cluster_visitor', {
                  classes: [classNode('org.hjug.graphbuilder.visitor.Visitor', 'Visitor', 'Visitor', '', false)]
                })
              ]
            })
          ]
        })
      ],
      edges: [{ source: 'Detector', target: 'Visitor', weight: 1, markedForRemoval: false }]
    };

    const lines = hierarchyToDot(hierarchy).split('\n');
    expect(lines.filter(l => l === 'style=filled fillcolor=pink;')).toHaveLength(1);
    expect(lines.filter(l => l === 'style=filled fillcolor=white;')).toHaveLength(3);
    expect(lines[lines.indexOf('label="org.hjug.graphbuilder";') + 1]).toBe('style=filled fillcolor=pink;');
    expect(lines[lines.indexOf('label="org.hjug.graphbuilder.metrics";') + 1]).toBe('style=filled fillcolor=white;');
    expect(lines[lines.indexOf('label="org.hjug.graphbuilder.visitor";') + 1]).toBe('style=filled fillcolor=white;');
  });
});

describe('packageHierarchyToDot (flat ellipse nodes + relationship edges)', () => {
  function packageTree() {
    return [
      packageNode('org.hjug', 'cluster_hjug', {
        nodeId: 'package_hjug',
        renderAsNode: false,
        path: 'src/main/java/org/hjug/',
        children: [
          packageNode('org.hjug.cbc', 'cluster_cbc', { nodeId: 'package_cbc', renderAsNode: true, needsBreakUp: true }),
          packageNode('org.hjug.dsm', 'cluster_dsm', { nodeId: 'package_dsm', renderAsNode: true })
        ]
      })
    ];
  }

  it('renders one ellipse per package with only the relationship edges', () => {
    const hierarchy = {
      packages: packageTree(),
      edges: [
        { source: 'package_hjug', target: 'package_cbc', weight: 1, markedForRemoval: false },
        { source: 'package_cbc', target: 'package_dsm', weight: 2, markedForRemoval: true }
      ]
    };

    expect(packageHierarchyToDot(hierarchy)).toBe(
      'strict digraph G {\n' +
      'package_hjug [label="org.hjug" shape=ellipse];\n' +
      'package_cbc [label="org.hjug.cbc" shape=ellipse color=red style=filled];\n' +
      'package_dsm [label="org.hjug.dsm" shape=ellipse];\n' +
      'package_hjug -> package_cbc [ label = "1" weight = "1" ];\n' +
      'package_cbc -> package_dsm [ label = "2" weight = "2" color = "red" ];\n' +
      '}'
    );
  });

  it('bakes the dark palette fontcolor into the package edges', () => {
    const hierarchy = {
      packages: packageTree(),
      edges: [{ source: 'package_cbc', target: 'package_dsm', weight: 2, markedForRemoval: true }]
    };

    const dot = packageHierarchyToDot(hierarchy, { edgeFontColor: '#9fb0c0' });
    expect(dot).toContain('package_cbc -> package_dsm [ label = "2" weight = "2" color = "red" fontcolor = "#9fb0c0" ];');
    expect(dot).toContain('shape=ellipse color=red style=filled');
  });

  it('hyperlinks package nodes with a path when the repository URL resolves to http(s)', () => {
    const hierarchy = {
      packages: [
        packageNode('org.hjug', 'cluster_hjug', {
          nodeId: 'package_hjug',
          path: 'src/main/java/org/hjug/',
          renderAsNode: false,
          children: [
            packageNode('org.hjug.cbc', 'cluster_cbc', { nodeId: 'package_cbc', path: 'src/main/java/org/hjug/cbc/' }),
            packageNode('org.hjug.dsm', 'cluster_dsm', { nodeId: 'package_dsm' })
          ]
        })
      ],
      edges: [{ source: 'package_cbc', target: 'package_dsm', weight: 1, markedForRemoval: false }]
    };

    const withRepoUrl = packageHierarchyToDot(hierarchy, { repoUrl: 'https://github.com/x/y/blob/main/' });
    expect(withRepoUrl).toContain(
      'package_cbc [label="org.hjug.cbc" shape=ellipse URL="https://github.com/x/y/blob/main/src/main/java/org/hjug/cbc/" target="_blank"]');
    expect(withRepoUrl).not.toContain('URL="https://github.com/x/y/blob/main/"');
    expect(packageHierarchyToDot(hierarchy)).not.toContain('URL=');
    expect(packageHierarchyToDot(hierarchy, { repoUrl: 'javascript:alert(1)/' })).not.toContain('URL=');
  });

  it('renders empty, null and undefined hierarchies as a bare digraph', () => {
    const bare = 'strict digraph G {\n}';
    expect(packageHierarchyToDot({ packages: [], edges: [] })).toBe(bare);
    expect(packageHierarchyToDot(null)).toBe(bare);
    expect(packageHierarchyToDot(undefined)).toBe(bare);
  });
});

describe('hierarchyToDot edge font color (dark palette edge labels)', () => {
  const hierarchy = () => ({
    packages: [
      packageNode('(default package)', 'cluster_default', {
        classes: [classNode('A', 'A', 'A', '', false), classNode('B', 'B', 'B', '', false)]
      })
    ],
    edges: [
      { source: 'A', target: 'B', weight: 2, markedForRemoval: true },
      { source: 'B', target: 'A', weight: 1, markedForRemoval: false }
    ]
  });

  it('bakes fontcolor into every edge while red removal edges stay red', () => {
    expect(hierarchyToDot(hierarchy(), { edgeFontColor: '#9fb0c0' })).toBe(
      'strict digraph G {\n' +
      'subgraph cluster_default {\n' +
      'label="(default package)";\n' +
      'style=filled fillcolor=white;\n' +
      'A [ shape=ellipse];\n' +
      'B [ shape=ellipse];\n' +
      '}\n' +
      'A -> B [ label = "2" weight = "2" color = "red" fontcolor = "#9fb0c0" ];\n' +
      'B -> A [ label = "1" weight = "1" fontcolor = "#9fb0c0" ];\n' +
      '}'
    );
  });

  it('emits no fontcolor when the option is missing or empty', () => {
    const plain =
      'strict digraph G {\n' +
      'subgraph cluster_default {\n' +
      'label="(default package)";\n' +
      'style=filled fillcolor=white;\n' +
      'A [ shape=ellipse];\n' +
      'B [ shape=ellipse];\n' +
      '}\n' +
      'A -> B [ label = "2" weight = "2" color = "red" ];\n' +
      'B -> A [ label = "1" weight = "1" ];\n' +
      '}';
    expect(hierarchyToDot(hierarchy())).toBe(plain);
    expect(hierarchyToDot(hierarchy(), {})).toBe(plain);
    expect(hierarchyToDot(hierarchy(), { edgeFontColor: '' })).toBe(plain);
  });

  it('never applies the edge label color to nodes or clusters', () => {
    const dot = hierarchyToDot(hierarchy(), { edgeFontColor: '#9fb0c0' });
    const lines = dot.split('\n');
    const edgeLines = lines.filter(l => l.includes('->'));
    const statementLines = lines.filter(l => !l.includes('->'));
    expect(edgeLines.length).toBeGreaterThan(0);
    expect(edgeLines.every(l => l.includes('fontcolor = "#9fb0c0"'))).toBe(true);
    expect(statementLines.every(l => !l.includes('fontcolor'))).toBe(true);
  });
});

describe('escapeDotQuoted', () => {
  it('escapes quotes, backslashes and line breaks like the Java builder', () => {
    expect(escapeDotQuoted('a\\b"c\nd')).toBe('a\\\\b\\"c\\nd');
  });

  it('returns the empty string for null and undefined', () => {
    expect(escapeDotQuoted(null)).toBe('');
    expect(escapeDotQuoted(undefined)).toBe('');
  });
});
