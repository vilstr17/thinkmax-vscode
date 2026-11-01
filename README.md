# thinkmax for VS Code

Quick puzzles and reply alerts for Codex and Claude Code while you work in VS Code.

[Visit the Thinkmax landing page](https://thinkmaxx-site-deploy.vercel.app) for the product overview and interactive puzzle demos.

## Install

In VS Code, open **Extensions**, search for **thinkmax**, and select **Install**. You can also install a `.vsix` package from **Extensions → … → Install from VSIX…**.

Requires desktop VS Code 1.96 or later, plus Codex CLI or Claude Code installed and signed in.

## Get started

Open a trusted project and run `codex` or `claude` in a VS Code terminal. thinkmax detects the session and opens a puzzle. To start one yourself, run **thinkmax: Play a Puzzle** from the Command Palette or click thinkmax in the status bar.

Activity alerts connect automatically in trusted projects. Codex may ask you to trust thinkmax hooks in `/hooks`; restart the terminal if prompted. To connect terminals outside the open project, run **thinkmax: Connect All Terminals**. Use **thinkmax: Disconnect This Project** or **thinkmax: Disconnect Account Alerts** to remove the corresponding hooks.

## Puzzles and alerts

Play Lights, Lights 3D, Sum Grid, Symbol Grid, Mental Rotation, AI River, and Robot Tracks. Choose a puzzle and difficulty in the thinkmax panel; hints are available as you play. Your progress saves automatically.

Reply alerts stay in the panel so you can see when an assistant finishes, fails, is interrupted, or needs your input. **Open chat** returns you to the matching terminal.

## Privacy and compatibility

Activity signals stay on your computer. thinkmax does not read prompts, replies, or transcripts. Hooks preserve existing settings. For Codex alerts, thinkmax may update `features.daemon_auto_start`; disconnect restores the original value if it has not changed since.

This source is version 0.9.3. The extension has been tested on macOS; Windows support is included but has not been live-tested. Remote SSH, WSL, and container terminals are not supported.

## For contributors

This repository contains the VS Code extension only; the website source lives elsewhere. Press **F5** to open an Extension Development Host. From this folder, run `npm test`, `npm run check`, and `python3 scripts/package.py` to check and package the extension.

## License

MIT. See [LICENSE](LICENSE).
