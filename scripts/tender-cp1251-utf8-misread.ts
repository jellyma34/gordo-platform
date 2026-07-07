import iconv from "iconv-lite";

function countCyrillicLetters(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0x0400 && c <= 0x04ff) n++;
  }
  return n;
}

const h0 =
  "№ статей;ID Код;Этап работ;ГПР;Отставание;Начало тендера;;;Дата заключения договора;;;Стоимость (руб.);;;Контрагент;Договор;Статус;Комментарий к отклонениям";
const bytes = iconv.encode(h0, "win1251");
const utf8mis = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
console.log({
  fffd: utf8mis.includes("\uFFFD"),
  cy: countCyrillicLetters(utf8mis),
  sample: utf8mis.slice(0, 60),
});
