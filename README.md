<p align="center">
  <img src="build/icon.png" width="96" alt="MD Viewer icon" />
</p>

<h1 align="center">MD Viewer</h1>

<p align="center">
  A beautiful Markdown viewer for Windows and macOS with tabs. Open as many <code>.md</code> files as you like.<br />
  Гарний переглядач Markdown для Windows і macOS із вкладками.
</p>

<p align="center">
  <a href="https://github.com/ndkedrov/md-viewer/releases/latest"><b>⬇ Download for Windows or macOS</b></a>
</p>

![MD Viewer, dark theme](docs/screenshot-dark.png)

![MD Viewer, light theme](docs/screenshot-light.png)

## Features

- **Tabs**, like in a code editor: close button, middle click, drag to reorder, right-click menu
  (close others, close to the right, show in Explorer / Finder, copy path).
- **Outline** on the left that highlights the section you are reading.
- **Live reload**: save the file in any editor and the tab updates without losing your place.
- **GitHub-flavoured rendering**: tables, task lists, footnotes, emoji, front matter,
  `> [!NOTE]` alerts, syntax highlighting with a copy button, and **Mermaid** diagrams.
- **Relative links** open the linked `.md` file in a new tab; images next to the file just work.
- **Find in document** (`Ctrl+F` / `⌘F`), text size (`Ctrl` + wheel), page width, print.
- **Light and dark themes** that follow the system, or pick one yourself.
- **English and Ukrainian** interface, chosen from the system language.
- **Default app for `.md`**: the installer registers MD Viewer for Markdown files, and the app offers a one-click
  “Make default” prompt (Windows asks you to confirm the choice once).
- Remembers open tabs between launches; double-clicking a `.md` file opens it in the running window.
- **On macOS**: a native menu bar in your language, Open Recent, full screen, and the window lives on after
  you close it, like any Mac app.
- Safe to open unknown files: scripts and other active content in documents are stripped.

## Keyboard shortcuts

On macOS use `⌘` instead of `Ctrl`, `⌘G` / `⇧⌘G` for find next / previous, `⌘R` to reload and
`⇧⌘]` / `⇧⌘[` for the next / previous tab.

| Keys                                   | Action                    |
| -------------------------------------- | ------------------------- |
| `Ctrl+O`                               | Open files                |
| `Ctrl+W` / middle click                | Close tab                 |
| `Ctrl+Shift+T`                         | Reopen closed tab         |
| `Ctrl+Tab` / `Ctrl+Shift+Tab`          | Next / previous tab       |
| `Ctrl+1` … `Ctrl+9`                    | Jump to tab               |
| `Ctrl+F`, `F3` / `Shift+F3`            | Find, next / previous     |
| `Ctrl+B`                               | Toggle outline            |
| `Ctrl+=` / `Ctrl+-` / `Ctrl+0`         | Text size                 |
| `F5`                                   | Reload file               |
| `Ctrl+P`                               | Print                     |

## Install

### Windows

Download `MD-Viewer-Setup-x.y.z.exe` from [Releases](https://github.com/ndkedrov/md-viewer/releases/latest)
and run it. The installer lets you choose the folder, adds Start menu and desktop shortcuts, and registers
MD Viewer for `.md` / `.markdown` files.

To open Markdown files with a double click, press **Make default** on the prompt in the app (or **⋯ → Make default
app for .md files**) and pick **MD Viewer → Always** in the Windows dialog. Windows does not let apps change the
default on their own, so this one click is needed once.

> Windows SmartScreen may warn that the app is from an unknown publisher, because the installer
> is not code-signed. Click **More info → Run anyway**.

### macOS

Download `MD-Viewer-x.y.z-mac.dmg` from [Releases](https://github.com/ndkedrov/md-viewer/releases/latest), open it
and drag **MD Viewer** to **Applications**. The app is signed and notarized by Apple, runs natively on Apple silicon
and Intel, and needs macOS 13 or newer.

To open Markdown files with a double click, select a `.md` file in Finder, press `⌘I`, choose **MD Viewer** under
**Open with** and click **Change All…**.

The Mac App Store version works the same, inside Apple's sandbox: when a document shows pictures or links from its
own folder, press **Allow folder access…** once and MD Viewer remembers it.

## Build from source

Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
git clone https://github.com/ndkedrov/md-viewer.git
cd md-viewer
npm install
npm start -- examples/welcome.md   # run in development
npm run dist                       # build the installer into dist/
```

On macOS:

```bash
npm run dist:mac      # signed + notarized universal DMG (needs a Developer ID certificate)
npm run dist:mas      # Mac App Store package (needs build/MD_Viewer_Mac_App_Store.provisionprofile)
npm run dist:mas-dev  # sandboxed build for local testing (needs the development profile)
```

Notarization reads `APPLE_API_KEY` (path to the `.p8` key), `APPLE_API_KEY_ID` and `APPLE_API_ISSUER` from the
environment. Provisioning profiles are not kept in the repository.

`npm run icon` regenerates `build/*.ico`, the PNG icons and, on a Mac, `build/*.icns` from the SVG sources.

Pushing a tag like `v1.0.1` builds the installer on GitHub Actions and attaches it to a release.

### Project layout

```
src/main/       Electron main process: window, files, watching, Markdown rendering
src/preload/    the small, safe API the page is allowed to use
src/renderer/   the interface: tabs, outline, find, themes (plain HTML/CSS/JS)
build/          icons, installer resources and macOS entitlements
examples/       demo documents
```

## Українською

**MD Viewer** — програма для зручного читання `.md` файлів. Відкривайте скільки завгодно документів:
кожен у своїй вкладці з хрестиком для закриття, як у текстовому редакторі.

- Зміст ліворуч підсвічує розділ, який ви читаєте.
- Файл оновлюється сам, щойно ви зберегли його в іншому редакторі.
- Таблиці, списки задач, підсвітка коду з кнопкою «Копіювати», діаграми Mermaid, блоки `> [!NOTE]`.
- Світла й темна теми, інтерфейс українською.
- На macOS — рідне меню українською, «Відкрити нещодавні», повноекранний режим.
- Щоб .md файли відкривались подвійним кліком, натисніть **Зробити за замовчуванням** у програмі й виберіть
  **MD Viewer → Завжди** у вікні Windows (один раз: Windows не дозволяє програмам змінювати це самостійно).

**Встановлення:** завантажте `MD-Viewer-Setup-x.y.z.exe` зі сторінки
[Releases](https://github.com/ndkedrov/md-viewer/releases/latest) і запустіть. Якщо Windows покаже
попередження SmartScreen, натисніть **Докладніше → Виконати все одно** (інсталятор не підписаний сертифікатом).

**macOS:** завантажте `MD-Viewer-x.y.z-mac.dmg`, відкрийте його й перетягніть **MD Viewer** у **Програми**.
Застосунок підписаний і нотаризований Apple, працює на Apple silicon та Intel, потрібна macOS 13 або новіша.

## License

[MIT](LICENSE) · [Privacy Policy](PRIVACY.md) · [Terms of Use](TERMS.md)
