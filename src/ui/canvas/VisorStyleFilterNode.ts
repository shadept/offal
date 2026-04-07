/**
 * VisorStyleFilterNode — Phaser 4 RenderNode for post-barrel visor styling.
 */
import { visorStyleFragSource } from './visor-style-frag';

export function createVisorStyleFilterNode(manager: any): any {
  const existingNode = manager.getNode('FilterColorMatrix');
  if (!existingNode) {
    throw new Error('[visor-style] Cannot find FilterColorMatrix to derive BaseFilterShader');
  }
  const BaseFilterShader = Object.getPrototypeOf(
    Object.getPrototypeOf(existingNode)
  ).constructor;

  const node = Object.create(BaseFilterShader.prototype);
  BaseFilterShader.call(node, 'FilterVisorStyle', manager, null, visorStyleFragSource);

  node.setupUniforms = function (controller: any, _drawingContext: any) {
    const pm = node.programManager;
    pm.setUniform('uVignette', controller.vignette);
    pm.setUniform('uScanlines', controller.scanlines);
    pm.setUniform('uChroma', controller.chroma);
    pm.setUniform('uViewportScale', controller.viewportScale ?? 1);
    pm.setUniform('uTime', controller.time);
  };

  return node;
}
