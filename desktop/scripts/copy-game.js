'use strict';
// 저장소 루트의 게임 파일을 desktop/game/ 으로 복사한다 (앱에 넣을 내용).
// --web <폴더> 를 주면 그 폴더에 브라우저용 묶음을 만든다 (index.html을 바로 열어서 실행).
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PARTS = ['index.html', 'js', 'css', 'assets'];

function copyGame(dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const p of PARTS) {
    fs.cpSync(path.join(ROOT, p), path.join(dest, p), { recursive: true });
  }
}

const webIdx = process.argv.indexOf('--web');
if (webIdx >= 0) {
  const dest = path.resolve(process.argv[webIdx + 1]);
  copyGame(dest);
  fs.copyFileSync(path.join(__dirname, '..', 'web-README.txt'), path.join(dest, '먼저 읽어 주세요.txt'));
  console.log('web build ->', dest);
} else {
  copyGame(path.join(__dirname, '..', 'game'));
  console.log('game files -> desktop/game');
}
