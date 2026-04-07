/**
 * VisorWarpFilterNode — Phaser 4 RenderNode for the visor warp shader.
 */
import { visorWarpFragSource } from './visor-warp-frag';

export function createVisorWarpFilterNode(manager: any): any {
  const existingNode = manager.getNode('FilterColorMatrix');
  if (!existingNode) {
    throw new Error('[visor-warp] Cannot find FilterColorMatrix to derive BaseFilterShader');
  }
  const BaseFilterShader = Object.getPrototypeOf(
    Object.getPrototypeOf(existingNode)
  ).constructor;

  const node = Object.create(BaseFilterShader.prototype);
  BaseFilterShader.call(node, 'FilterVisorWarp', manager, null, visorWarpFragSource);

  node.setupUniforms = function (controller: any, _drawingContext: any) {
    const pm = node.programManager;
    pm.setUniform('uAmplitude', controller.amplitude);
    pm.setUniform('uScale', controller.scale);
  };

  return node;
}
