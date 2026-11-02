import * as XLSX from 'xlsx';

export const sampleCsvName = '고객_2026년11월.csv';
export const sampleXlsxName = '주문_추가.xlsx';

export const sampleCsvText = `2026년 11월 고객 원장,,,,
고객명,이메일,거래일,금액,메모
김서연,seoyeon@example.com,2026.11.02,"1,200,000원",신규
이도윤,doyun@example.com,2026년 11월 3일,"₩850,000",재구매
박하늘,haneul@example.com,2026/11/04,"2,400,000원",기업
김서연,seoyeon@example.com,2026.11.02,"1,200,000원",중복
최유진,yujin@example.com,11/13/2026,"(35,000원)",환불
정민준,minjun@example.com,2026.02.31,금액없음,오류
한소율,soyul@example.com,20261102,"￦15,000",숫자형 날짜
`;

export function excelSerial(year: number, month: number, day: number) {
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 31)) / 86400000) + 1;
}

export function sampleWorkbookArray() {
  const rows: (string | number)[][] = [
    ['고객번호', 'name', '이메일', '주문일', '총액'],
    ['007', '오세준', 'sejun@example.com', excelSerial(2026, 11, 6), 450000],
    ['002', '이도윤', 'doyun@example.com', '2026-11-03', '₩850,000'],
    ['008', '배수아', 'suah@example.com', '2026.11.07', '1,500,000원'],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const dateCell = sheet.D2;
  if (dateCell) dateCell.z = 'yyyy.mm.dd';
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, '주문');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([]), '빈시트');
  return XLSX.write(book, {bookType: 'xlsx', type: 'array'}) as Uint8Array;
}

export function embeddedSampleFiles() {
  const bytes = sampleWorkbookArray();
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return [
    new File([sampleCsvText], sampleCsvName),
    new File([copy], sampleXlsxName),
  ];
}
