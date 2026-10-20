"use client";

import {useEffect, useMemo, useRef, useState} from 'react';
import {AlertCircle, ArrowDownToLine, ArrowRight, Check, CheckCircle2, ChevronRight, Columns3, FileSpreadsheet, Info, LoaderCircle, RefreshCw, RotateCcw, Save, Search, Settings2, X} from 'lucide-react';
import {canonical, configurationError, defaultSettings, exportWorkbook, readFile, transform, type Cell, type Settings, type Source} from './engine';
import {download, Footer, Header, Help, History, MobilePanes, Steps, UndoNotice, UploadBox, useCloud, useConfirmation, useLoginDraft, type Pane} from './shared';

type Preview = ReturnType<typeof transform>;
type Snapshot = {sources: Source[]; selected: string[]; settings: Settings; demo: boolean; label: string};
const pageSize = 50, issuePageSize = 20;
const sampleA='ID,고객명,email,date,amount\n001,김서연,seoyeon@example.com,2026-10-01,"₩12,000"\n002,이도윤,doyun@example.com,2026-10-02,"₩24,000"\n003,박하늘,haneul@example.com,2026-10-03,"₩18,500"';
const sampleB='고객번호,name,이메일,거래일,총액\n002,이도윤,doyun@example.com,2026-10-02,"₩24,000"\n004,최유진,yujin@example.com,2026-10-05,"₩32,000"\n005,정민준,minjun@example.com,03/04/2026,"₩15,000"';

export default function Editor({signedIn}: {signedIn: boolean}) {
  const [sources,setSources]=useState<Source[]>([]), [selected,setSelected]=useState<string[]>([]), [settings,setSettings]=useState<Settings>(defaultSettings);
  const [preview,setPreview]=useState<Preview|null>(null), [approved,setApproved]=useState(false), [ack,setAck]=useState(false);
  const [busy,setBusy]=useState(false), [progress,setProgress]=useState(''), [error,setError]=useState(''), [message,setMessage]=useState('');
  const [pane,setPane]=useState<Pane>('canvas'), [demo,setDemo]=useState(false), [view,setView]=useState('before'), [originalId,setOriginalId]=useState('');
  const [query,setQuery]=useState(''), [page,setPage]=useState(0), [issuePage,setIssuePage]=useState(0), [reviewOpen,setReviewOpen]=useState(false), [focusRow,setFocusRow]=useState<number|null>(null);
  const [undo,setUndo]=useState<Snapshot|null>(null);
  const toolsRef=useRef<HTMLElement>(null), issuesRef=useRef<HTMLDetailsElement>(null);
  const confirmation=useConfirmation();
  const active=useMemo(()=>sources.filter(source=>selected.includes(source.id)),[sources,selected]);
  const columns=useMemo(()=>[...new Set(active.flatMap(source=>source.mapping.filter(Boolean)))],[active]);
  const inputCount=active.reduce((n,source)=>n+source.rows.length,0);
  const source=active.find(item=>item.id===originalId)||active[0];
  const problem=useMemo(()=>active.length?configurationError(active,settings):null,[active,settings]);
  const conflicts=new Set(active.filter(source=>new Set(source.mapping.filter(Boolean)).size!==source.mapping.filter(Boolean).length).map(source=>source.id));
  const displayColumns=view==='before'?source?.headers||[]:preview?.columns||columns;
  const originalRows=useMemo(()=>source?source.rows.map(row=>Object.fromEntries(source.headers.map((header,i)=>[header,row[i]??'']))):[],[source]);
  const allRows=view==='before'?originalRows:preview?.rows||[];
  const searchedRows=useMemo(()=>{const q=query.trim().toLocaleLowerCase();return allRows.map((row,index)=>({row,index})).filter(({row})=>!q||Object.values(row).some(value=>String(value??'').toLocaleLowerCase().includes(q)));},[allRows,query]);
  const currentPage=Math.min(page,Math.max(0,Math.ceil(searchedRows.length/pageSize)-1));
  const issueLookup=useMemo(()=>new Map(preview?.issues.map(issue=>[`${issue.outputRow}:${issue.column}`,issue])||[]),[preview]);
  const suggestions=columns.filter(column=>/^(날짜|거래일|일자|date|마감일|납기일|금액|총액|amount|매출액|단가|가격)$/i.test(column));

  function invalidate() {setPreview(null);setApproved(false);setAck(false);setPage(0);setIssuePage(0);setQuery('');setFocusRow(null);setReviewOpen(false);setView('before');}
  function configure(next: Partial<Settings>) {setSettings(value=>({...value,...next}));invalidate();setError('');setMessage('설정을 변경했습니다. 새 미리보기를 만들어 확인해 주세요.');}
  function remember(label: string) {setUndo(sources.length?{sources,selected,settings,demo,label}:null);}
  useEffect(()=>{setSettings(value=>{const keys=value.keys.filter(column=>columns.includes(column)), dateColumns=value.dateColumns.filter(column=>columns.includes(column)), moneyColumns=value.moneyColumns.filter(column=>columns.includes(column));return JSON.stringify([keys,dateColumns,moneyColumns])===JSON.stringify([value.keys,value.dateColumns,value.moneyColumns])?value:{...value,keys,dateColumns,moneyColumns};});},[columns]);
  function restore(payload: any) {
    const data=payload?.sources;
    if(payload?.kind!=='sheetfix'||!Array.isArray(data)||data.length>15||!data.every((s: any)=>typeof s.id==='string'&&typeof s.name==='string'&&typeof s.sheet==='string'&&Array.isArray(s.headers)&&Array.isArray(s.mapping)&&s.mapping.every((v: any)=>typeof v==='string')&&Array.isArray(s.rows)&&s.rows.every((r: any)=>Array.isArray(r)))||!payload.settings) throw Error('올바른 SheetFix 작업이 아닙니다.');
    if(data.reduce((n: number,s: Source)=>n+s.rows.length,0)>50000) throw Error('저장한 작업이 50,000행 제한을 초과합니다.');
    const config=payload.settings;
    if(!['keys','dateColumns','moneyColumns'].every(key=>Array.isArray(config[key])&&config[key].every((v: any)=>typeof v==='string'))||!['ISO','DMY','MDY'].includes(config.dateFormat)||!['first','last'].includes(config.keep))throw Error('저장한 정리 설정을 읽을 수 없습니다.');
    setSources(data);setSelected(Array.isArray(payload.selected)?payload.selected.filter((id: string)=>data.some((s: Source)=>s.id===id)):data.map((s: Source)=>s.id));setSettings(config);setDemo(!!payload.demo);setOriginalId(data[0]?.id||'');invalidate();setPane('canvas');setError('');setUndo(null);
  }
  const payload=()=>({kind:'sheetfix',sources,selected,settings,demo});
  const cloud=useCloud(signedIn,restore);
  useEffect(()=>{if(cloud.cloudStatus)setMessage('');},[cloud.cloudStatus]);
  const onAuth=useLoginDraft('sheetfix-login-draft',payload,restore,sources.length>0,setMessage);

  async function upload(files: File[]) {
    if(busy||!files.length)return;
    setBusy(true);setError('');setMessage('');
    const accepted: Source[]=[], errors: string[]=[];let totalRows=sources.reduce((count,source)=>count+source.rows.length,0);
    try {
      for(let i=0;i<files.length;i++) {
        setProgress(`${i+1}/${files.length} · ${files[i].name}`);
        try {const sheets=await readFile(files[i]);if(sources.length+accepted.length+sheets.length>15)throw Error('최대 15개 시트입니다. 필요 없는 시트를 제거한 뒤 추가해 주세요.');const rows=sheets.reduce((n,s)=>n+s.rows.length,0);if(totalRows+rows>50000)throw Error('전체 합계 50,000행을 초과합니다. 파일을 나눠 추가해 주세요.');accepted.push(...sheets);totalRows+=rows;}
        catch(error) {const detail=(error as Error).message;const readable=/[가-힣]/.test(detail)?detail:'파일을 읽지 못했습니다. 원본 프로그램에서 파일이 열리는지 확인한 뒤 CSV 또는 XLSX로 다시 저장해 주세요.';errors.push(readable.startsWith(files[i].name+':')?readable:`${files[i].name}: ${readable}`);}
      }
      if(accepted.length) {remember('파일을 추가했습니다. 이전 작업으로 되돌릴 수 있습니다.');setSources(current=>[...current,...accepted]);setSelected(current=>[...current,...accepted.map(s=>s.id)]);setOriginalId(accepted[0].id);invalidate();setDemo(false);setPane('canvas');}
      if(errors.length) {setError(errors.join('\n'));setPane('canvas');requestAnimationFrame(()=>document.getElementById('workspace-main')?.scrollTo({top:0,behavior:'auto'}));}
    } finally {setBusy(false);setProgress('');}
  }
  function updateMapping(id: string,column: number,value: string) {setSources(all=>all.map(source=>source.id===id?{...source,mapping:source.mapping.map((v,i)=>i===column?value:v)}:source));invalidate();setError('');}
  function remove(id: string) {remember('시트를 제거했습니다. 되돌린 후 미리보기를 다시 만들 수 있습니다.');setSources(all=>all.filter(source=>source.id!==id));setSelected(all=>all.filter(value=>value!==id));invalidate();setError('');}
  function reset() {remember('작업을 비웠습니다. 이전 파일과 설정을 복원할 수 있습니다.');setSources([]);setSelected([]);setSettings(defaultSettings());setDemo(false);invalidate();setError('');setMessage('');setPane('canvas');}
  function undoLast() {if(!undo)return;setSources(undo.sources);setSelected(undo.selected);setSettings(undo.settings);setDemo(undo.demo);setOriginalId(undo.sources[0]?.id||'');setUndo(null);invalidate();setError('');setMessage('이전 파일과 설정을 복원했습니다. 결과는 다시 미리보기로 확인해 주세요.');setPane('canvas');}
  function showTools() {setPane('tools');toolsRef.current?.scrollTo({top:0,behavior:'auto'});}
  function run() {
    setError('');setMessage('');
    try {const result=transform(active,settings);setPreview(result);setApproved(false);setAck(false);setQuery('');setPage(0);setIssuePage(0);setFocusRow(null);setView('after');setReviewOpen(result.issues.length>0);setPane('canvas');}
    catch(error) {setError((error as Error).message);setApproved(false);}
  }
  async function sample() {
    if(busy)return;setBusy(true);
    try {const items=[...await readFile(new File([sampleA],'고객_10월.csv')),...await readFile(new File([sampleB],'고객_추가.csv'))];remember('예시 파일로 바꿨습니다. 이전 작업을 복원할 수 있습니다.');setSources(items);setSelected(items.map(source=>source.id));setOriginalId(items[0].id);setSettings({...defaultSettings(),dedup:true,keys:['이메일'],dateColumns:['날짜'],moneyColumns:['금액']});invalidate();setDemo(true);setPane('canvas');setError('');setMessage('예시에는 중복 1행과 해석이 모호한 날짜 1건이 있습니다. 미리보기로 확인해 보세요.');}
    catch(error){setError((error as Error).message);}finally{setBusy(false);}
  }
  function recommend() {configure({dateColumns:columns.filter(column=>/^(날짜|거래일|일자|date|마감일|납기일)$/i.test(column)),moneyColumns:columns.filter(column=>/^(금액|총액|amount|매출액|단가|가격)$/i.test(column))});}
  function setFormat(column: string,type: string) {configure({dateColumns:[...settings.dateColumns.filter(c=>c!==column),...(type==='date'?[column]:[])],moneyColumns:[...settings.moneyColumns.filter(c=>c!==column),...(type==='money'?[column]:[])]});}
  function exportResult() {
    if(!approved||!preview)return;
    try {download('SheetFix-정리결과.xlsx',exportWorkbook(preview,settings),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');setMessage(`XLSX 다운로드를 시작했습니다. 전체 결과 ${preview.rows.length.toLocaleString()}행${preview.issues.length?'과 검토 사항 시트':''}를 포함합니다.`);}
    catch(error){setError(`파일을 내보내지 못했습니다. ${(error as Error).message}`);}
  }
  function jumpToIssue(outputRow: number) {setView('after');setQuery('');setPage(Math.floor((outputRow-1)/pageSize));setFocusRow(outputRow);setPane('canvas');}
  useEffect(()=>{if(focusRow!==null&&view==='after'&&pane==='canvas')document.getElementById(`output-row-${focusRow}`)?.scrollIntoView({block:'nearest',behavior:'auto'});},[focusRow,currentPage,view,pane]);
  function primaryAction() {
    if(!sources.length) {document.getElementById('sheet-files')?.click();setPane('files');}
    else if(!active.length) setPane('files');
    else if(problem) showTools();
    else if(!preview) run();
    else if(preview.issues.length && !ack) {setReviewOpen(true);setPane('canvas');requestAnimationFrame(()=>document.getElementById('approval-check')?.scrollIntoView({block:'center',behavior:'auto'}));}
    else if(!approved) setApproved(true);
    else exportResult();
  }
  const primaryLabel=!sources.length?'파일 추가':!active.length?'시트 선택':problem?'설정 확인':!preview?'미리보기 만들기':preview.issues.length&&!ack?'검토 항목 확인':!approved?'이 결과 승인':'XLSX 다운로드';

  return <div className="app" data-app="sheetfix">
    <Header name="SheetFix" signedIn={signedIn} onAuth={onAuth}>{signedIn && <button className="header-save" aria-label={cloud.pending?'작업 저장 중':'클라우드에 작업 저장'} title="클라우드에 작업 저장" disabled={!sources.length||busy||cloud.pending} onClick={()=>cloud.save(`데이터 정리 · ${new Date().toLocaleDateString('ko-KR')}`,payload())}><Save size={15}/><span>{cloud.pending?'저장 중…':'작업 저장'}</span></button>}</Header>
    <MobilePanes pane={pane} onChange={setPane} fileCount={sources.length} resultLabel="데이터 검토" toolLabel="정리 설정"/>
    <div className="workspace" data-pane={pane}>
      <aside className="side side-left" tabIndex={-1} aria-label="데이터 파일"><h2 className="side-title">데이터 파일 <span>{sources.length}/15시트</span></h2>
        <UploadBox id="sheet-files" title="CSV / XLSX 파일" detail="여러 파일 선택 또는 끌어놓기" accept=".csv,.xlsx" multiple disabled={busy} onFiles={upload}/>
        {sources.length>0 && <p className="source-total">체크한 시트를 한 결과로 합칩니다.</p>}
        {sources.map(source=><div className="source-card" key={source.id}><label className="source-check"><input type="checkbox" disabled={busy} checked={selected.includes(source.id)} aria-label={`${source.name} / ${source.sheet} 포함`} onChange={e=>{setSelected(ids=>e.target.checked?[...ids,source.id]:ids.filter(id=>id!==source.id));invalidate();}}/><span><strong>{source.name}</strong><small>{source.sheet} · {source.rows.length.toLocaleString()}행 · {source.headers.length}열</small></span></label><button className="icon-button" disabled={busy} aria-label={`${source.name} / ${source.sheet} 제거`} onClick={()=>remove(source.id)}><X size={14}/></button></div>)}
        <p className="side-note">파일당 10MB · 총 50,000행<br/>최대 15개 시트 · 시트당 100열</p>
        <hr className="side-divider"/>
        <button className="wide" disabled={busy} onClick={sample}><FileSpreadsheet size={15}/>예시 CSV 2개 살펴보기</button>
        <button className="ghost wide small-button" disabled={!sources.length||busy} onClick={reset}><RotateCcw size={14}/>새 작업</button>
        <History cloud={cloud} signedIn={signedIn} beforeLoad={action=>{if(busy)return;if(sources.length)confirmation.ask('저장한 작업을 불러올까요?','현재 파일과 설정을 바꿉니다. 미리보기와 승인은 다시 확인해야 합니다.',action);else action();}}/>
        <Help><p>첫 번째 내용이 있는 행을 열 제목으로 읽습니다. 빈 행은 제외하고, 선택한 시트들을 세로로 합칩니다.</p><p>수식은 실행하지 않고 저장된 값을 읽습니다. 날짜는 연-월-일로, 통화는 숫자로 변환합니다. 서로 다른 통화가 섞인 열과 형식 오류는 원문을 유지합니다.</p></Help>
      </aside>
      <main className="main" id="workspace-main" tabIndex={-1} aria-label="데이터 검토 작업">
        <div className="main-content">
          <div className="page-heading"><div><div className="eyebrow">DATA CLEANING WORKSPACE</div><h1>{approved?'확인한 데이터, 내보낼 준비 완료.':'파일을 합치고, 결과를 확인하세요.'}</h1><p>원본을 지키면서 정리하고, 승인한 결과만 다운로드합니다.</p></div>{demo && <span className="badge">예시 데이터</span>}</div>
          <Steps labels={['파일 추가','정리 설정','검토·다운로드']} current={approved?3:preview?2:sources.length?1:0}/>
          {busy && <div className="message info" role="status"><LoaderCircle size={16}/><span>파일을 읽고 있습니다. {progress}</span></div>}
          {error && <div className="message error" role="alert"><AlertCircle size={16}/><span style={{whiteSpace:'pre-line'}}>{error}</span><button className="icon-button" aria-label="오류 닫기" onClick={()=>setError('')}><X size={15}/></button></div>}
          {undo && !busy && <UndoNotice message={undo.label} undo={undoLast}/>}
          {(message||cloud.cloudStatus) && <div className="message" role="status"><Info size={16}/><span>{message||cloud.cloudStatus}</span><button className="icon-button" aria-label="안내 닫기" onClick={()=>{setMessage('');cloud.clearStatus();}}><X size={15}/></button></div>}
          {active.length>0 ? <>
            <div className="metrics"><div className="metric"><strong>{inputCount.toLocaleString()}</strong><span>입력 행 · {active.length}시트</span></div><div className="metric"><strong>{preview?preview.rows.length.toLocaleString():'—'}</strong><span>결과 행</span></div><div className="metric"><strong>{preview?preview.removed.toLocaleString():'—'}</strong><span>중복 제거</span></div><button className="metric metric-button" disabled={!preview?.issues.length} aria-pressed={reviewOpen} onClick={()=>{setReviewOpen(true);issuesRef.current?.scrollIntoView({block:'nearest',behavior:'auto'});}}><strong>{preview?preview.issues.length.toLocaleString():'—'}</strong><span>검토 항목 <ChevronRight size={12}/></span></button></div>
            {!preview && <div className={`message ${problem?'warning':'info'}`}><Settings2 size={16}/><span>{problem||'원본 미리보기입니다. 정리 설정을 확인한 후 아래에서 미리보기를 만드세요.'}</span><button onClick={showTools}>정리 설정</button></div>}
            <div className="toolbar"><div className="segmented" aria-label="데이터 보기 방식"><button aria-pressed={view==='before'} onClick={()=>{setView('before');setQuery('');setPage(0);}}>원본</button><button disabled={!preview} aria-pressed={view==='after'} onClick={()=>{setView('after');setQuery('');setPage(0);}}>변환 결과</button></div>{preview && <button className="small-button" disabled={busy} onClick={run} title="현재 설정으로 새 미리보기를 만들고 이전 승인을 취소합니다"><RefreshCw size={13}/>다시 미리보기</button>}<label className="search-field"><span className="visually-hidden">셀 내용 검색</span><Search size={15}/><input type="search" placeholder="셀 내용 검색" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label></div>
            {view==='before' && <div className="inline-control"><label htmlFor="original-sheet">원본 시트</label><select id="original-sheet" value={source?.id||''} onChange={e=>{setOriginalId(e.target.value);setPage(0);setQuery('');}}>{active.map(source=><option value={source.id} key={source.id}>{source.name} / {source.sheet}</option>)}</select></div>}
            <div className="canvas-card"><div className="canvas-topline"><strong>{view==='before'?'원본 데이터':'변환 결과'}</strong><span className="header-spacer"/><span>{searchedRows.length.toLocaleString()}행{query?' · 검색 적용':''}</span>{view==='after' && <span className="badge">{approved?'승인 완료':'승인 전 미리보기'}</span>}</div>
              <div className="table-scroll"><table className="data-table"><thead><tr><th scope="col">행</th>{displayColumns.map(column=><th scope="col" key={column}>{column}</th>)}</tr></thead><tbody>{searchedRows.slice(currentPage*pageSize,(currentPage+1)*pageSize).map(({row,index})=><tr key={index} id={view==='after'?`output-row-${index+1}`:undefined} className={view==='after'&&focusRow===index+1?'focus-row':''}><td className="row-number">{view==='before'?source?.rowNumbers?.[index]??index+2:index+1}</td>{displayColumns.map(column=>{const issue=view==='after'?issueLookup.get(`${index+1}:${column}`):undefined;const before=preview?.originalRows[index]?.[column];const changed=view==='after'&&before!==row[column];return <td key={column} className={issue?'cell-issue':changed?'cell-changed':''} title={issue?`${issue.message}\n${issue.source} / ${issue.sheet} · ${issue.sourceRow}행`:changed?`원문: ${String(before??'')}\n변환: ${String(row[column]??'')}`:String(row[column]??'')}>{String(row[column]??'')}</td>;})}</tr>)}</tbody></table>{searchedRows.length===0 && <div className="empty-state"><h2>{query?'검색 결과가 없습니다.':'표시할 데이터 행이 없습니다.'}</h2>{query && <button onClick={()=>setQuery('')}>검색 초기화</button>}</div>}</div>
              <div className="pagination"><button disabled={currentPage===0} onClick={()=>setPage(value=>value-1)}>이전</button><span>{currentPage+1} / {Math.max(1,Math.ceil(searchedRows.length/pageSize))}페이지 · 50행씩 표시</span><button disabled={(currentPage+1)*pageSize>=searchedRows.length} onClick={()=>setPage(value=>value+1)}>다음</button></div>
              <div className="table-caption">{view==='before'?`${source?.name} / ${source?.sheet} · 원래 열 이름과 값을 그대로 표시합니다.`:'초록 셀은 변환된 값, 노란 셀은 원문을 유지한 검토 항목입니다. 셀에 마우스를 올리면 원문을 볼 수 있습니다.'}</div>
            </div>
            {preview && <>
              <div className="preview-note"><Check size={14}/>{preview.changedCells.toLocaleString()}개 셀 변환 · {preview.removed.toLocaleString()}행 중복 제거 · 다운로드에는 검색과 관계없이 전체 {preview.rows.length.toLocaleString()}행 포함</div>
              {preview.issues.length>0 && <><details className="issue-panel" ref={issuesRef} open={reviewOpen} onToggle={e=>setReviewOpen(e.currentTarget.open)}><summary><AlertCircle size={16}/>확인할 값 {preview.issues.length.toLocaleString()}건 · 원문 유지</summary><div className="issue-list">{preview.issues.slice(issuePage*issuePageSize,(issuePage+1)*issuePageSize).map((issue,index)=><button key={issuePage*issuePageSize+index} onClick={()=>jumpToIssue(issue.outputRow)} title="결과의 해당 셀로 이동"><span><strong>{issue.source} / {issue.sheet} · 원본 {issue.sourceRow}행 · {issue.column}</strong><small className="issue-value">{String(issue.value??'')}</small><small>{issue.message}</small></span><ChevronRight size={15}/></button>)}</div>{preview.issues.length>issuePageSize && <div className="pagination"><button disabled={issuePage===0} onClick={()=>setIssuePage(value=>value-1)}>이전 검토</button><span>{issuePage+1} / {Math.ceil(preview.issues.length/issuePageSize)}</span><button disabled={(issuePage+1)*issuePageSize>=preview.issues.length} onClick={()=>setIssuePage(value=>value+1)}>다음 검토</button></div>}</details><div className="approval-area" id="approval-check"><label className="check-row"><input type="checkbox" checked={ack} disabled={busy} onChange={e=>{setAck(e.target.checked);if(!e.target.checked)setApproved(false);}}/>확인할 값 {preview.issues.length}건이 원문 그대로 포함되는 것을 확인했습니다.</label><p>해석이 잘못된 날짜는 ‘정리 설정’에서 입력 형식을 바꾼 후 미리보기를 다시 만드세요. 검토 목록은 XLSX의 별도 시트에도 포함합니다.</p></div></>}
              {approved && <div className="message success" role="status"><CheckCircle2 size={16}/><span>이 결과를 승인했습니다. 아래에서 XLSX를 받을 수 있습니다. 파일이나 설정을 바꾸면 승인이 취소됩니다.</span></div>}
            </>}
          </> : <div className="canvas-card"><div className="empty-state"><div className="empty-icon"><FileSpreadsheet size={31}/></div><h2>{sources.length?'합칠 시트를 선택하세요.':'정리할 파일부터 추가하세요.'}</h2><p>{sources.length?'파일 목록에서 포함할 시트를 체크해 주세요. 선택한 시트만 정리 결과에 포함됩니다.':'여러 CSV와 XLSX를 함께 추가할 수 있습니다. 미리보기에서 원본과 결과를 확인한 뒤 내보내세요.'}</p><div className="empty-actions"><button disabled={busy} onClick={sample}>예시 CSV 2개로 살펴보기<ArrowRight size={14}/></button></div></div><div className="empty-steps"><div><b>01</b><strong>파일과 시트 선택</strong><span>여러 파일을 한 결과로 합치기</span></div><div><b>02</b><strong>필요한 정리만 설정</strong><span>열 연결 · 날짜·통화 · 중복</span></div><div><b>03</b><strong>확인 후 다운로드</strong><span>원문을 지키고 승인한 결과만</span></div></div></div>}
        </div>
        <div className="action-bar"><div className="action-text"><strong>{busy?'파일을 읽고 있습니다':approved?`${preview?.rows.length.toLocaleString()}행 · 내보내기 준비 완료`:preview?`${preview.rows.length.toLocaleString()}행 미리보기 · ${preview.issues.length}건 확인 필요`:problem?'정리 설정을 확인해 주세요':active.length?`${active.length}개 시트 · ${inputCount.toLocaleString()}행 선택됨`:'파일을 추가해 시작하세요'}</strong><small>{preview?.issues.length&&!ack?'원문 유지 항목을 확인한 뒤 체크해 주세요.':approved?'검토 사항은 별도 시트에 함께 포함합니다.':preview?'결과를 확인하고 승인하면 다운로드할 수 있습니다.':active.length?'설정 후 미리보기를 만드세요. 원본은 바뀌지 않습니다.':'로그인 없이 파일 정리와 다운로드가 가능합니다.'}</small></div><div className="action-controls">{active.length>0 && <button className="icon-button mobile-only" aria-label="정리 설정 열기" onClick={showTools}><Settings2 size={17}/></button>}<button className="primary" disabled={busy} onClick={primaryAction}>{busy?<LoaderCircle size={16}/>:approved?<ArrowDownToLine size={16}/>:preview?<Check size={16}/>:<ArrowRight size={16}/>} {busy?'읽는 중…':primaryLabel}</button></div></div>
      </main>
      <aside className="side side-right" ref={toolsRef} aria-label="정리 설정"><h2 className="side-title">정리 설정 <span>원본 유지</span></h2>{active.length ? <fieldset disabled={busy} style={{border:0,padding:0,margin:0,minWidth:0}}>
        {problem && <p className="field-error" role="status">{problem}</p>}
        <details className="tool-section" open={conflicts.size>0?true:undefined}><summary><span className="tool-kicker">01</span>열 연결·이름</summary><p className="field-help">같은 출력 이름끼리 하나의 열로 합칩니다. 이름을 비우면 그 열을 제외합니다.</p>{active.map(source=><details className="mapping-group" key={source.id} open={conflicts.has(source.id)?true:undefined}><summary>{source.name} / {source.sheet}{conflicts.has(source.id)?' · 이름 중복':''}</summary><div className="mapping-fields">{source.headers.map((header,index)=><label className="mapping-row" key={index}><span>{header} → 출력 열</span><input type="text" list="output-columns" aria-label={`${source.name} / ${source.sheet} ${header} 출력 열`} value={source.mapping[index]} placeholder="비우면 이 열 제외" onChange={e=>updateMapping(source.id,index,e.target.value)} onBlur={e=>{if(e.target.value!==e.target.value.trim())updateMapping(source.id,index,e.target.value.trim());}}/></label>)}<button className="small-button wide" onClick={()=>{setSources(all=>all.map(item=>item.id===source.id?{...item,mapping:item.headers.map(canonical)}:item));invalidate();}}>이 시트 연결 초기화</button></div></details>)}<datalist id="output-columns">{columns.map(column=><option key={column} value={column}/>)}</datalist><p className="field-help">연결할 출력 열: {columns.join(' · ')||'없음'}</p></details>
        <details className="tool-section" open><summary><span className="tool-kicker">02</span>열별 값 형식</summary><p className="field-help">정리할 열만 바꾸세요. ‘원문 유지’는 값과 형식을 변환하지 않습니다.</p>{suggestions.length>0 && <button className="wide small-button" onClick={recommend}><Columns3 size={13}/>날짜·금액 추천 형식 적용</button>}{columns.map(column=><label className="format-row" key={column}><span>{column}</span><select aria-label={`${column} 값 형식`} value={settings.dateColumns.includes(column)?'date':settings.moneyColumns.includes(column)?'money':'original'} onChange={e=>setFormat(column,e.target.value)}><option value="original">원문 유지</option><option value="date">날짜 · 연-월-일</option><option value="money">통화 → 숫자</option></select></label>)}{settings.dateColumns.length>0 && <label className="field-label">입력 날짜 형식<select style={{marginTop:8}} value={settings.dateFormat} onChange={e=>configure({dateFormat:e.target.value as Settings['dateFormat']})}><option value="ISO">연-월-일 · 모호한 날짜 표시</option><option value="DMY">일/월/년 · 예: 31/12/2026</option><option value="MDY">월/일/년 · 예: 12/31/2026</option></select></label>}{settings.moneyColumns.length>0 && <p className="field-help">₩·$·€ 및 KRW·USD·EUR, 쉼표 천 단위·점 소수점을 지원합니다. 환율 변환은 하지 않으며, 통화가 섞인 열은 원문을 유지합니다.</p>}</details>
        <details className="tool-section" open={settings.dedup?true:undefined}><summary><span className="tool-kicker">03</span>중복 제거 <span className="count">{settings.dedup?'켜짐':'꺼짐'}</span></summary><label className="check-row"><input type="checkbox" checked={settings.dedup} onChange={e=>configure({dedup:e.target.checked,keys:settings.keys.length?settings.keys:columns})}/>중복 행 제거</label><p className="field-help">기본값은 모든 행 유지입니다. 켜면 선택한 열이 모두 같은 행만 중복으로 봅니다.</p>{settings.dedup && <><span className="field-label">중복 판단 열</span>{columns.map(column=><label className="check-row" key={column}><input type="checkbox" checked={settings.keys.includes(column)} aria-label={`${column} 중복 판단 기준`} onChange={e=>configure({keys:e.target.checked?[...settings.keys,column]:settings.keys.filter(value=>value!==column)})}/>{column}</label>)}{settings.keys.length===0 && <p className="field-error">기준 열을 하나 이상 선택해 주세요.</p>}<label className="field-label">중복일 때 유지할 행<select style={{marginTop:8}} value={settings.keep} onChange={e=>configure({keep:e.target.value as Settings['keep']})}><option value="first">먼저 나온 행</option><option value="last">마지막에 나온 행</option></select></label><p className="field-help">파일 목록 순서대로 합칩니다. 기준 값이 모두 비어 있는 행은 제거하지 않습니다.</p></>}</details>
        <button className="wide mobile-only" onClick={()=>setPane('canvas')}>데이터 검토로 돌아가기<ArrowRight size={14}/></button>
      </fieldset> : <div className="side-empty"><Settings2 size={24}/><p>파일을 추가하면 열 연결, 값 형식, 중복 제거를 설정할 수 있습니다.</p><button className="wide mobile-only" onClick={()=>setPane('files')}>파일 선택하기<ArrowRight size={14}/></button></div>}</aside>
    </div>
    <Footer text={busy?'파일 읽는 중':approved?'결과 승인 완료':preview?'미리보기 완료 · 승인 대기':sources.length?`${sources.length}개 시트 추가됨`:'파일 추가 대기'}/>{confirmation.dialog}
  </div>;
}
