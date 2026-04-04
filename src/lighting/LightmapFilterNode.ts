/**
 * LightmapFilterNode — Phaser 4 RenderNode for the lightmap shader.
 * Created as an instance via createLightmapFilterNode().
 */
import { lightmapFragSource } from './lightmap-frag';

export function createLightmapFilterNode(manager: any): any {
  const existingNode = manager.getNode('FilterColorMatrix');
  if (!existingNode) {
    throw new Error('[lighting] Cannot find FilterColorMatrix to derive BaseFilterShader');
  }
  const BaseFilterShader = Object.getPrototypeOf(
    Object.getPrototypeOf(existingNode)
  ).constructor;

  const node = Object.create(BaseFilterShader.prototype);
  BaseFilterShader.call(node, 'FilterLightmap', manager, null, lightmapFragSource);

  node.setupTextures = function (controller: any, textures: any[], _dc: any) {
    textures[1] = controller.lightmapGlTexture;
    textures[2] = controller.visibilityGlTexture;
  };

  node.setupUniforms = function (controller: any, _drawingContext: any) {
    const pm = node.programManager;
    const camera = controller.camera;
    const wv = camera.worldView;
    pm.setUniform('uLightmapSampler', 1);
    pm.setUniform('uVisibilitySampler', 2);
    pm.setUniform('uWorldViewPos', [wv.x, wv.y]);
    pm.setUniform('uWorldViewSize', [wv.width, wv.height]);
    pm.setUniform('uMapSize', controller.mapSize);
    pm.setUniform('uTileSize', controller.tileSize);
    pm.setUniform('uTime', controller.time);
    pm.setUniform('uSeenTint', controller.seenTint);
    pm.setUniform('uLightScale', controller.lightScale);
    pm.setUniform('uRevealAll', controller.revealAll);
    pm.setUniform('uDebugMode', controller.debugMode);
  };

  return node;
}
