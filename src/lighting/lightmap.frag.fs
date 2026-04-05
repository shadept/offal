#pragma phaserTemplate(shaderName)
precision mediump float;

uniform sampler2D uMainSampler;
uniform sampler2D uLightmapSampler;
uniform sampler2D uVisibilitySampler;

uniform vec2 uWorldViewPos;   // world position of camera top-left (pixels)
uniform vec2 uWorldViewSize;  // world area visible (pixels), accounts for zoom
uniform vec2 uMapSize;        // map dimensions in tiles
uniform float uTileSize;
uniform float uTime;
uniform vec3 uSeenTint;
uniform float uLightScale;
uniform float uRevealAll;
uniform float uDebugMode;     // 0=normal, 1=lightmap RGB, 2=visibility, 3=light intensity

varying vec2 outTexCoord;

// ════════════════════════════════════════════════════════════
// Uncharted 2 filmic tone mapping (John Hable)
// ════════════════════════════════════════════════════════════

const float uc2A = 0.15;
const float uc2B = 0.50;
const float uc2C = 0.10;
const float uc2D = 0.20;
const float uc2E = 0.02;
const float uc2F = 0.30;
const float uc2W = 11.2;

vec3 Uncharted2Tonemap(vec3 x) {
    return ((x*(uc2A*x+uc2C*uc2B)+uc2D*uc2E)/(x*(uc2A*x+uc2B)+uc2D*uc2F))-uc2E/uc2F;
}

// ════════════════════════════════════════════════════════════
// Flicker — compute multiplier for a tile at the given UV
// ════════════════════════════════════════════════════════════

vec3 flickerAt(vec2 uv) {
    int bRaw = int(texture2D(uVisibilitySampler, uv).b * 255.0 + 0.5);
    int ft = bRaw - (bRaw / 4) * 4;
    float fs = float(bRaw / 4) / 63.0;
    if (ft == 1) {
        // Fire: per-tile random flicker
        vec2 tp = floor(uv * uMapSize);
        float seed = fract(sin(dot(tp, vec2(127.1, 311.7))) * 43758.5453);
        float f = sin(uTime * 9.0 + seed * 6.28) * 0.12
               + sin(uTime * 14.0 + seed * 41.0) * 0.10
               + sin(uTime * 23.0 + seed * 97.0) * 0.06;
        return vec3(0.88 + f) * vec3(1.0 + f * 0.4, 1.0 - abs(f) * 0.2, 1.0 - f * 1.2);
    } else if (ft == 2) {
        // Broken: per-source random blackouts
        float cut = step(0.92, fract(sin(floor(uTime * 3.0 + fs * 100.0)) * 43758.5453));
        return vec3(1.0 - cut * 0.85);
    } else if (ft == 3) {
        // Pulse: per-source sine throb
        return vec3(0.90 + 0.10 * sin(uTime * 2.0 + fs * 6.28));
    }
    return vec3(1.0);
}

// ════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════

void main() {
    vec4 scene = texture2D(uMainSampler, outTexCoord);

    // outTexCoord.y=0 is screen-bottom (GL convention);
    // worldView.y is the top of the visible area, so flip Y.
    vec2 worldPixel = vec2(
        uWorldViewPos.x + outTexCoord.x * uWorldViewSize.x,
        uWorldViewPos.y + (1.0 - outTexCoord.y) * uWorldViewSize.y
    );
    vec2 tilePos = worldPixel / uTileSize;

    vec2 tileUV = tilePos / uMapSize;

    if (tileUV.x < 0.0 || tileUV.x > 1.0 || tileUV.y < 0.0 || tileUV.y > 1.0) {
        gl_FragColor = scene;
        return;
    }

    // ── Debug visualizations ──
    if (uDebugMode > 0.5) {
        vec3 lraw = texture2D(uLightmapSampler, tileUV).rgb;
        vec3 vdata = texture2D(uVisibilitySampler, tileUV).rgb;
        if (uDebugMode < 1.5) {
            gl_FragColor = vec4(lraw * uLightScale, 1.0);
            return;
        } else if (uDebugMode < 2.5) {
            float vr = vdata.r;
            vec3 vc = vr < 0.1 ? vec3(0.6, 0.0, 0.0)
                    : vr < 0.75 ? vec3(0.7, 0.7, 0.0)
                    : vec3(0.0, 0.7, 0.0);
            gl_FragColor = vec4(mix(scene.rgb * 0.3, vc, 0.7), 1.0);
            return;
        } else if (uDebugMode < 3.5) {
            float intensity = dot(lraw * uLightScale, vec3(0.299, 0.587, 0.114));
            vec3 heat;
            if (intensity < 0.2) heat = mix(vec3(0.0), vec3(0.0, 0.0, 1.0), intensity / 0.2);
            else if (intensity < 0.4) heat = mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 1.0), (intensity - 0.2) / 0.2);
            else if (intensity < 0.6) heat = mix(vec3(0.0, 1.0, 1.0), vec3(0.0, 1.0, 0.0), (intensity - 0.4) / 0.2);
            else if (intensity < 0.8) heat = mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 1.0, 0.0), (intensity - 0.6) / 0.2);
            else heat = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), (intensity - 0.8) / 0.2);
            gl_FragColor = vec4(mix(scene.rgb * 0.2, heat, 0.8), 1.0);
            return;
        } else {
            int ftRaw = int(vdata.b * 255.0 + 0.5);
            int ft = ftRaw - (ftRaw / 4) * 4;
            vec3 fc = ft == 1 ? vec3(1.0, 0.3, 0.0)
                    : ft == 2 ? vec3(0.0, 0.8, 1.0)
                    : ft == 3 ? vec3(1.0, 0.0, 1.0)
                    : vec3(0.0);
            gl_FragColor = vec4(mix(scene.rgb * 0.3, fc, ft > 0 ? 0.8 : 0.0), 1.0);
            return;
        }
    }

    vec2 visData = texture2D(uVisibilitySampler, tileUV).rg;
    float vis = visData.r;
    float tileType = visData.g; // 0=VOID, ~0.33=HULL, ~0.5=FLOOR, 1=WALL

    // VOID (space) — pass through scene unmodified, same as out-of-bounds
    if (tileType < 0.1) {
        gl_FragColor = scene;
        return;
    }

    // UNSEEN — dimmed, not yet explored
    if (uRevealAll < 0.5 && vis < 0.1) {
        vec3 unseen = scene.rgb * 0.08;
        float luma = dot(unseen, vec3(0.299, 0.587, 0.114));
        gl_FragColor = vec4(mix(unseen, vec3(luma), 0.6), scene.a * 0.5);
        return;
    }

    // SEEN flag — will desaturate after lighting
    float isSeen = (uRevealAll < 0.5 && vis < 0.75) ? 1.0 : 0.0;

    // B channel packs flicker type (bits 0-1) + source seed (bits 2-7)
    int bRaw = int(texture2D(uVisibilitySampler, tileUV).b * 255.0 + 0.5);
    int flickerType = bRaw - (bRaw / 4) * 4;
    float flickerSeed = float(bRaw / 4) / 63.0;
    vec3 light = texture2D(uLightmapSampler, tileUV).rgb * uLightScale;

    if (flickerType == 1) {
        // Fire: per-tile random flicker (no spatial waves)
        float seed = fract(sin(dot(floor(tilePos), vec2(127.1, 311.7))) * 43758.5453);
        float f = sin(uTime * 9.0 + seed * 6.28) * 0.12
               + sin(uTime * 14.0 + seed * 41.0) * 0.10
               + sin(uTime * 23.0 + seed * 97.0) * 0.06;
        float intensity = 0.88 + f;
        vec3 warm = vec3(1.0 + f * 0.4, 1.0 - abs(f) * 0.2, 1.0 - f * 1.2);
        light *= intensity * warm;
    } else if (flickerType == 2) {
        // Broken: random step-function blackouts — all tiles from same source cut together
        float seed = flickerSeed;
        float cut = step(0.92, fract(sin(floor(uTime * 3.0 + seed * 100.0)) * 43758.5453));
        light *= 1.0 - cut * 0.85;
    } else if (flickerType == 3) {
        // Pulse: sine intensity throb — all tiles from same source pulse together
        light *= 0.90 + 0.10 * sin(uTime * 2.0 + flickerSeed * 6.28);
    }

    // Wall quadrant lighting: walls receive light from neighbors.
    // Sample at the CENTER of each neighbor tile to avoid interpolation artifacts.
    // Each neighbor light is modulated by its own flicker effect.
    if (tileType > 0.9) {
        vec2 texel = vec2(1.0) / uMapSize;
        vec2 sub = fract(tilePos);
        vec2 center = (floor(tilePos) + 0.5) / uMapSize;
        vec2 nUV = center + vec2(0.0, -texel.y);
        vec2 sUV = center + vec2(0.0,  texel.y);
        vec2 wUV = center + vec2(-texel.x, 0.0);
        vec2 eUV = center + vec2( texel.x, 0.0);
        vec3 lN = texture2D(uLightmapSampler, nUV).rgb * uLightScale * flickerAt(nUV);
        vec3 lS = texture2D(uLightmapSampler, sUV).rgb * uLightScale * flickerAt(sUV);
        vec3 lW = texture2D(uLightmapSampler, wUV).rgb * uLightScale * flickerAt(wUV);
        vec3 lE = texture2D(uLightmapSampler, eUV).rgb * uLightScale * flickerAt(eUV);
        vec3 blended = mix(mix(max(lN, lW), max(lN, lE), sub.x),
                           mix(max(lS, lW), max(lS, lE), sub.x), sub.y);
        light = blended;
    }

    light = max(light, vec3(0.06));

    // Apply Uncharted 2 tone mapping
    float exposureBias = 10.0;
    vec3 curr = Uncharted2Tonemap(exposureBias * light);
    vec3 whiteScale = vec3(1.0) / Uncharted2Tonemap(vec3(uc2W));
    vec3 mapped = curr * whiteScale;

    vec3 result = scene.rgb * mapped;

    // SEEN — desaturate (remembered, not currently visible)
    if (isSeen > 0.5) {
        float luma = dot(result, vec3(0.299, 0.587, 0.114));
        result = mix(result, vec3(luma), 0.65);
    }

    gl_FragColor = vec4(result, scene.a);
}
