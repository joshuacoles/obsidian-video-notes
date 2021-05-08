import { MarkdownRenderChild, MarkdownView, Plugin } from 'obsidian';

import { runAppleScriptAsync } from "run-applescript";

interface VideoController {
  open(value: string): Promise<void>;
  getCurrentTimestamp(): Promise<string>
  seekToTimestamp(timeStamp: string): Promise<void>

  isOpen(value: string): Promise<boolean>
}

const generic: VideoController = {
  async isOpen(value: string): Promise<boolean> {
    return true;
  },

  async open(url) {
    // We specify safari as that is what we are using in all the other commands.
    await runAppleScriptAsync(`do shell script "open -a Safari '${url}'`);
  },

  async getCurrentTimestamp(): Promise<string> {
    const js = `t = document.querySelector('video').currentTime; ts= Math.floor(t / 60) + ':' + (Math.floor(t) % 60); ts`;
    return await runAppleScriptAsync(`tell application "Safari" to do JavaScript "${js}" in document 1`);
  },

  async seekToTimestamp(ts: string) {
    const [m, s] = ts.split(':');
    const tc = (+m * 60) + +s;
    const js = `document.querySelector('video').currentTime = ${tc}`;
    await runAppleScriptAsync(`tell application "Safari" to do JavaScript "${js}" in document 1`);
  }
};

export default class VideoNotesPlugin extends Plugin {
  statusBarItem: HTMLElement;

  async onload() {
    console.log('loading plugin');
    this.statusBarItem = this.addStatusBarItem();
    this.statusBarItem.setText('Status Bar Text');

    this.addCommand({
      id: 'insert-current-timestamp',
      name: 'Insert Current Timestamp',
      callback: async () => {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) {
          console.error("Huh I thought that worked")
          return;
        }
        const ts = await generic.getCurrentTimestamp();

        activeView.editor.replaceSelection(`\`vts ${ts}\``)
      }
    });

    this.addCommand({
      id: 'open-associated-video',
      name: 'Open Associated Video',
      callback: async () => {
        const video: string | undefined = this.app.metadataCache.getFileCache(this.app.workspace.getActiveFile()).frontmatter['video'];
        if (video) {
          await generic.open(video);
        }
      }
    });

    this.registerMarkdownPostProcessor(async (el, ctx) => {
      // Search for <code> blocks inside this element, looking for things `vts mm:ss`
      let codeblocks = el.querySelectorAll("code");
      for (let index = 0; index < codeblocks.length; index++) {
        let codeblock = codeblocks.item(index);

        let match = codeblock.innerText.trim().match(/vts (\d+:\d\d)/);
        if (!match) continue;
        let timeStamp = match[1];

        ctx.addChild(new TimeStampRenderer(timeStamp, el, codeblock, this));
      }
    });
  }

  onunload() {
    console.log('unloading plugin');
  }
}

class TimeStampRenderer extends MarkdownRenderChild {
  constructor(
    public timeStamp: string,
    public container: HTMLElement,
    public target: HTMLElement,
    public plugin: VideoNotesPlugin
  ) {
    super(container);
  }

  async onload() {
    await this.render();
  }

  async render() {
    let temp = document.createElement("span");
    // Steal the themes tag styles
    temp.className = 'tag';
    temp.onclick = () => generic.seekToTimestamp(this.timeStamp);
    temp.textContent = `[${this.timeStamp}]`;

    this.target.replaceWith(temp);
  }
}

