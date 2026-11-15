import { Composition } from "remotion";
import { Film, FPS, TOTAL } from "./Film";

export const Root = () => (
  <>
    <Composition id="Landscape" component={Film} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} defaultProps={{ lang: "zh" as const, portrait: false }} />
    <Composition id="Portrait" component={Film} durationInFrames={TOTAL} fps={FPS} width={1080} height={1920} defaultProps={{ lang: "zh" as const, portrait: true }} />
  </>
);
