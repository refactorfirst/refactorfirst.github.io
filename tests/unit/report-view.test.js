import { describe, it, expect, beforeEach } from 'bun:test';
import {
  exposeGraphDots,
  initBubbleChart,
  initDisharmonyCharts,
  initWasmGraphs,
  showPopup,
  hidePopup,
  bindPopupHandlers,
  enhanceReport,
  statefulElementIds,
  stashStatefulDom,
  graftStatefulDom
} from '../../lib/report-view.js';

describe('exposeGraphDots', () => {
  it('exposes class, package and cycle DOT strings as window globals', () => {
    exposeGraphDots({
      classMap: { dot: 'strict digraph C {}' },
      packageMap: { dot: 'strict digraph P {}' },
      classCycles: { largestCycle: { cycleIdentifier: 'cycle0', dot: 'strict digraph Z {}' } }
    });
    expect(window.classGraph_dot).toBe('strict digraph C {}');
    expect(window.packageGraph_dot).toBe('strict digraph P {}');
    expect(window.cycle0_dot).toBe('strict digraph Z {}');
  });

  it('tolerates missing graph sections', () => {
    delete window.classGraph_dot;
    expect(() => exposeGraphDots({})).not.toThrow();
    expect(window.classGraph_dot).toBeUndefined();
  });
});

describe('initBubbleChart', () => {
  beforeEach(() => {
    document.body.innerHTML = '<canvas id="chart_GOD"></canvas>';
    delete window.Chart;
  });

  it('does nothing when Chart.js is unavailable', () => {
    const canvas = document.getElementById('chart_GOD');
    expect(() => initBubbleChart(canvas, 'God Classes', { bubbles: [] })).not.toThrow();
  });

  it('creates a bubble chart with priority-ranked dataset', () => {
    const created = [];
    window.Chart = function (ctx, config) { created.push(config); };
    const canvas = document.getElementById('chart_GOD');
    initBubbleChart(canvas, 'God Classes', {
      xaxisLabel: 'Effort to refactor',
      yaxisLabel: 'Relative churn (impact)',
      bubbles: [{ x: 1, y: 2, r: 24, label: 'Foo.java', priority: 1, color: 'red', borderColor: 'darkred' }]
    });
    expect(created.length).toBe(1);
    const config = created[0];
    expect(config.type).toBe('bubble');
    expect(config.data.datasets[0].data[0].x).toBe(1);
    expect(config.data.datasets[0].data[0].raw.label).toBe('Foo.java');
    expect(config.options.scales.x.title.text).toBe('Effort to refactor');
    expect(config.options.scales.y.title.text).toBe('Relative churn (impact)');
  });
});

describe('initDisharmonyCharts', () => {
  it('initializes one chart per disharmony with an existing canvas', () => {
    document.body.innerHTML = '<canvas id="chart_GOD"></canvas>';
    const created = [];
    window.Chart = function (ctx, config) { created.push(config); };
    initDisharmonyCharts([
      { anchorId: 'GOD', title: 'God Classes', chart: { bubbles: [{ x: 1, y: 1, r: 5 }] } },
      { anchorId: 'BRAIN', title: 'Brain Methods', chart: { bubbles: [{ x: 2, y: 3, r: 2 }] } }
    ]);
    expect(created.length).toBe(1); // no canvas for BRAIN
    delete window.Chart;
  });

  it('skips disharmonies without chart data', () => {
    document.body.innerHTML = '<canvas id="chart_GOD"></canvas>';
    const created = [];
    window.Chart = function (ctx, config) { created.push(config); };
    initDisharmonyCharts([{ anchorId: 'GOD', title: 'God Classes' }]);
    expect(created.length).toBe(0);
    delete window.Chart;
  });
});

describe('initWasmGraphs', () => {
  it('resolves gracefully when the WASM loader is unavailable', async () => {
    document.body.innerHTML = '<div id="classGraph"></div>';
    // No network/WASM in tests: must resolve, not reject
    await initWasmGraphs({ classMap: { dot: 'strict digraph G {}', dotThresholdExceeded: false } });
  });

  it('skips graphs whose dot threshold was exceeded', async () => {
    document.body.innerHTML = '<div id="classGraph"></div>';
    await initWasmGraphs({ classMap: { dot: 'x', dotThresholdExceeded: true } });
    expect(document.getElementById('classGraph').innerHTML).toBe('');
  });
});

describe('popup helpers', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="overlay" id="overlay" style="display:none"></div>
      <div class="popup" id="popup-classGraph" style="display:none">
        <div id="graph-container-classGraph"></div>
      </div>`;
  });

  it('showPopup reveals the overlay and popup', () => {
    showPopup('popup-classGraph', 'graph-container-classGraph', 'strict digraph G {}');
    expect(document.getElementById('overlay').style.display).toBe('block');
    expect(document.getElementById('popup-classGraph').style.display).toBe('block');
  });

  it('hidePopup hides overlay and popups and clears graph containers', () => {
    document.getElementById('graph-container-classGraph').innerHTML = '<svg></svg>';
    showPopup('popup-classGraph', 'graph-container-classGraph', 'strict digraph G {}');
    hidePopup();
    expect(document.getElementById('overlay').style.display).toBe('none');
    expect(document.getElementById('popup-classGraph').style.display).toBe('none');
    expect(document.getElementById('graph-container-classGraph').innerHTML).toBe('');
  });
});

describe('bindPopupHandlers (template uses data attributes, no inline handlers)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main id="app">
        <div class="overlay" id="overlay" data-popup-close="true" style="display:none"></div>
        <button type="button" data-popup-2d data-popup="popup-classGraph"
                data-container="graph-container-classGraph" data-dot-var="classGraph_dot">2D</button>
        <button type="button" data-popup-3d data-popup="popup-classGraph"
                data-container="graph-container-classGraph" data-dot-var="classGraph_dot">3D</button>
        <div class="popup" id="popup-classGraph" style="display:none">
          <span class="close-btn" data-popup-close="true">&times;</span>
          <div id="graph-container-classGraph"></div>
        </div>
      </main>`;
  });

  it('opens a popup when a 2D button is clicked', () => {
    bindPopupHandlers(document.getElementById('app'));
    document.querySelector('[data-popup-2d]').click();
    expect(document.getElementById('overlay').style.display).toBe('block');
    expect(document.getElementById('popup-classGraph').style.display).toBe('block');
  });

  it('closes popups from the close button and the overlay', () => {
    bindPopupHandlers(document.getElementById('app'));
    document.querySelector('[data-popup-2d]').click();
    document.querySelector('.close-btn').click();
    expect(document.getElementById('popup-classGraph').style.display).toBe('none');

    document.querySelector('[data-popup-2d]').click();
    document.getElementById('overlay').click();
    expect(document.getElementById('popup-classGraph').style.display).toBe('none');
  });

  it('does not throw when buttons reference unknown popups', () => {
    document.body.innerHTML = '<main id="app"><button type="button" data-popup-2d data-popup="missing" data-container="missing" data-dot-var="nope">x</button></main>';
    bindPopupHandlers(document.getElementById('app'));
    expect(() => document.querySelector('button').click()).not.toThrow();
  });
});

describe('stateful DOM preservation across table-state re-renders', () => {
  const data = {
    disharmonies: [
      { anchorId: 'GOD', title: 'God Classes', chart: { bubbles: [{ x: 1, y: 1, r: 3 }] } },
      { anchorId: 'BRAIN', title: 'Brain Methods' } // no chart: not stateful
    ],
    classMap: { dot: 'strict digraph C {}', dotThresholdExceeded: false },
    packageMap: { dot: 'strict digraph P {}', dotThresholdExceeded: false, hasEdges: true },
    classCycles: { largestCycle: { cycleIdentifier: 'cycle_0', dot: 'x', dotThresholdExceeded: false } }
  };

  describe('statefulElementIds', () => {
    it('lists chart canvases and rendered graph containers only', () => {
      expect(statefulElementIds(data)).toEqual([
        'chart_GOD', 'classGraph', 'packageGraph', 'cycle_0'
      ]);
    });

    it('skips graphs whose dot threshold was exceeded or which lack edges', () => {
      expect(statefulElementIds({
        classMap: { dot: 'x', dotThresholdExceeded: true },
        packageMap: { dot: 'x', dotThresholdExceeded: false, hasEdges: false },
        classCycles: { largestCycle: { cycleIdentifier: 'cycle_0', dotThresholdExceeded: true } }
      })).toEqual([]);
    });

    it('tolerates a report without any graphs or charts', () => {
      expect(statefulElementIds({})).toEqual([]);
    });
  });

  describe('stashStatefulDom + graftStatefulDom', () => {
    function buildReport() {
      document.body.innerHTML = `
        <main id="app">
          <canvas id="chart_GOD" width="640" height="320"></canvas>
          <div id="classGraph"><svg class="fullscreen-svg"><g/></svg></div>
          <div id="packageGraph"><svg class="fullscreen-svg"><g/></svg></div>
          <div id="cycle_0"></div>
        </main>`;
      return document.getElementById('app');
    }

    it('stashes the live nodes and grafts them back into a fresh render', () => {
      const oldRoot = buildReport();
      const liveCanvas = oldRoot.querySelector('#chart_GOD');
      const liveGraph = oldRoot.querySelector('#classGraph');
      const stash = stashStatefulDom(oldRoot, data);

      // Simulate the innerHTML re-render: same markup, fresh nodes.
      buildReport();
      const newRoot = document.getElementById('app');
      expect(newRoot.querySelector('#chart_GOD')).not.toBe(liveCanvas);

      graftStatefulDom(newRoot, stash);
      expect(newRoot.querySelector('#chart_GOD')).toBe(liveCanvas);
      expect(newRoot.querySelector('#classGraph')).toBe(liveGraph);
      // The rendered SVG content travels with the grafted node.
      expect(newRoot.querySelector('#classGraph svg')).not.toBeNull();
    });

    it('ignores stateful ids that are absent from the old tree', () => {
      document.body.innerHTML = '<main id="app"><div id="classGraph"></div></main>';
      const stash = stashStatefulDom(document.getElementById('app'), data);
      expect(stash.size).toBe(1);

      buildReport();
      const newRoot = document.getElementById('app');
      const freshCanvas = newRoot.querySelector('#chart_GOD');
      graftStatefulDom(newRoot, stash);
      // Nothing stashed for chart_GOD: the fresh placeholder stays.
      expect(newRoot.querySelector('#chart_GOD')).toBe(freshCanvas);
      expect(newRoot.querySelector('#classGraph').childNodes.length).toBe(0);
    });

    it('leaves the new tree untouched for stashed ids without a placeholder', () => {
      const oldRoot = buildReport();
      const stash = stashStatefulDom(oldRoot, data);
      document.body.innerHTML = '<main id="app"><section>shrunk report</section></main>';
      const newRoot = document.getElementById('app');
      graftStatefulDom(newRoot, stash);
      expect(newRoot.textContent).toContain('shrunk report');
      expect(newRoot.querySelector('#chart_GOD')).toBeNull();
    });
  });
});

describe('enhanceReport', () => {
  it('exposes dots, wires popup globals and initializes charts', async () => {
    document.body.innerHTML = `
      <main id="app">
        <div class="overlay" id="overlay" style="display:none"></div>
        <div class="popup" id="popup-classGraph" style="display:none">
          <div id="graph-container-classGraph"></div>
        </div>
        <canvas id="chart_GOD"></canvas>
      </main>`;
    const created = [];
    window.Chart = function (ctx, config) { created.push(config); };
    const data = {
      project: { name: 'Demo' },
      classMap: { dot: 'strict digraph C {}', dotThresholdExceeded: true },
      disharmonies: [
        { anchorId: 'GOD', title: 'God Classes', chart: { bubbles: [{ x: 1, y: 1, r: 3 }] } }
      ]
    };
    await enhanceReport(document.getElementById('app'), data);

    expect(window.classGraph_dot).toBe('strict digraph C {}');
    expect(typeof window.showPopup).toBe('function');
    expect(typeof window.hidePopup).toBe('function');
    expect(typeof window.createForceGraph).toBe('function');
    expect(created.length).toBe(1);
    delete window.Chart;
  });
});
