import { Composition, Still } from "remotion";
import { Cover } from "./Cover";
import { Story, STORY_TOTAL } from "./Story";
import { Film, FPS, TOTAL } from "./Film";

export const Root = () => (
  <>
    <Composition id="Landscape" component={Film} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} defaultProps={{ lang: "zh" as const, portrait: false }} />
    <Composition id="Portrait" component={Film} durationInFrames={TOTAL} fps={FPS} width={1080} height={1920} defaultProps={{ lang: "zh" as const, portrait: true }} />
    <Composition id="StoryZh" component={Story} durationInFrames={STORY_TOTAL} fps={FPS} width={1080} height={1920} />
    <Still id="Cover" component={Cover} width={1080} height={1440} />
  </>
);
