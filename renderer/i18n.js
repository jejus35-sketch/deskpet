// 다국어 문구 (메인 프로세스와 화면에서 함께 사용) / Shared UI strings for main & renderer
(function (root) {
  const STRINGS = {
    ko: {
      petCat: '삼색이', petDog: '찹츄',
      hide: (p) => `${p} 숨기기`, show: (p) => `${p} 다시 부르기`,
      character: '캐릭터', cat: '삼색 고양이 (일러스트)', dog: '찹츄 리트리버 (일러스트)', catSoft: '삼색 고양이 (포근한 그림)', dogSoft: '찹츄 리트리버 (포근한 그림)',
      follow: '커서 따라다니기', pause: '정리 잠깐 멈추기',
      gap: '새 묶음 기준 (파일이 안 들어온 시간)', minutes: (m) => `${m}분`,
      openLast: '마지막 폴더 열기', autostart: '컴퓨터 켤 때 자동 실행', quit: '종료',
      language: '언어 / Language', langAuto: '자동 (Windows 설정)',
      folderPrefix: '정리',
      doneNew: (n) => `${n} 폴더에 담았어요!`, doneAdd: (n, c) => `${n}에 ${c}개 넣었어요`,
      askTitle: '새 묶음이에요! 폴더 이름을 붙여줄래요?',
      askSub: (c, f) => `파일 ${c}개 · 비워두면 ${f}`,
      placeholder: '예: 오늘 작업', inputLabel: '이번 묶음 폴더 이름',
      save: '저장', last: '아까 폴더', lastTitle: (n) => `아까 폴더: ${n}`, close: '숨기기',
    },
    en: {
      petCat: 'Calico', petDog: 'Chapchu',
      hide: (p) => `Hide ${p}`, show: (p) => `Bring back ${p}`,
      character: 'Character', cat: 'Calico cat (illustrated)', dog: 'Chapchu retriever (illustrated)', catSoft: 'Calico cat (soft)', dogSoft: 'Chapchu retriever (soft)',
      follow: 'Follow cursor', pause: 'Pause tidying',
      gap: 'New batch after (idle time)', minutes: (m) => `${m} min`,
      openLast: 'Open last folder', autostart: 'Start with Windows', quit: 'Quit',
      language: '언어 / Language', langAuto: 'Auto (Windows setting)',
      folderPrefix: 'Sorted',
      doneNew: (n) => `Saved to ${n}!`, doneAdd: (n, c) => `Added ${c} to ${n}`,
      askTitle: 'New batch! Name this folder?',
      askSub: (c, f) => `${c} file${c > 1 ? 's' : ''} · blank = ${f}`,
      placeholder: "e.g. Today's work", inputLabel: 'Folder name for this batch',
      save: 'Save', last: 'Last folder', lastTitle: (n) => `Last folder: ${n}`, close: 'Hide',
    },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = STRINGS;
  else root.I18N = STRINGS;
})(this);
