import ForceGraph3D from '3d-force-graph';

// The 3D node graph — runs natively in the tab with real WebGL (the whole reason
// this thread started). Pure client-side over whatever the adapter handed us.
export function mountGraph(el, graph, onSelect) {
  const fg = ForceGraph3D()(el)
    .graphData(graph)
    .nodeLabel('name')
    .nodeAutoColorBy('name')
    .nodeOpacity(0.9)
    .linkDirectionalParticles(1)
    .linkDirectionalParticleSpeed(0.006)
    .onNodeClick((node) => {
      const dist = 80;
      const ratio = 1 + dist / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
      fg.cameraPosition(
        { x: (node.x || 0) * ratio, y: (node.y || 0) * ratio, z: (node.z || 0) * ratio },
        node,
        800,
      );
      onSelect && onSelect(node.path);
    });
  fg.onEngineStop(() => fg.zoomToFit(600, 40));
  if (typeof window !== 'undefined') window.__fg = fg;
  return {
    update: (g) => fg.graphData(g),
    resize: (w, h) => fg.width(w).height(h),
    fit: () => fg.zoomToFit(600, 40),
  };
}
