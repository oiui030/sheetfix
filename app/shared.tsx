"use client";

import {useEffect, useRef, useState, type ReactNode} from "react";
import {ArrowDownToLine, Check, ChevronDown, FileText, FolderOpen, SlidersHorizontal, PanelsTopLeft, LogIn, RotateCcw, ShieldCheck, Trash2, Upload, X} from "lucide-react";

export function download(name: string, data: BlobPart, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([data], {type}));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export const esc = (s: string) => s.replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]!));
export type Pane = "files" | "canvas" | "tools";
export function MobilePanes({pane, onChange, resultLabel = "결과", toolLabel = "설정", fileCount}: {pane: Pane; onChange: (p: Pane) => void; resultLabel?: string; toolLabel?: string; fileCount: number}) {
  const items = [["files", `파일${fileCount ? ` · ${fileCount}` : ""}`, FolderOpen], ["canvas", resultLabel, PanelsTopLeft], ["tools", toolLabel, SlidersHorizontal]] as const;
  function select(value: Pane) {
    onChange(value);
    if (window.matchMedia("(min-width: 961px)").matches) {
      const target = document.querySelector<HTMLElement>(value === "files" ? ".side-left" : value === "tools" ? ".side-right" : ".main");
      target?.focus({preventScroll: true});
      target?.scrollTo({top: 0, behavior: "smooth"});
    }
  }
  return <><nav className="workspace-rail" aria-label="빠른 작업 영역">{items.map(([value,label,Icon]) => <button key={value} aria-label={label} title={label} aria-pressed={pane === value} onClick={() => select(value)}><Icon size={19}/></button>)}</nav><nav className="mobile-panes" aria-label="작업 영역">{items.map(([value,label]) => <button key={value} aria-pressed={pane === value} onClick={() => select(value)}>{label}</button>)}</nav></>;

}
export function Header({name, signedIn, children, onAuth}: {name: string; signedIn: boolean; children?: ReactNode; onAuth?: (e: React.MouseEvent<HTMLAnchorElement>) => void}) {
  return <header className="app-header"><a className="skip-link" href="#workspace-main">작업 영역으로 건너뛰기</a><div className="brand"><span className="brand-mark">{name[0]}</span>{name}</div><span className="workspace-label">작업 공간</span><span className="header-spacer"/>{children}<a className="auth-link" onClick={onAuth} target="_top" href={signedIn ? "/signout-with-chatgpt?return_to=/" : "/signin-with-chatgpt?return_to=/"}><LogIn size={15}/><span>{signedIn ? "로그아웃" : "로그인"}</span></a></header>;
}
export function Steps({labels, current}: {labels: string[]; current: number}) {
  return <ol className="steps" aria-label="작업 진행">{labels.map((label, i) => <li key={label} className={i < current ? "done" : i === current ? "current" : ""} aria-current={i === current ? "step" : undefined}><span>{i < current ? <Check size={12}/> : i + 1}</span>{label}</li>)}</ol>;
}
export function Footer({text}: {text: string}) { return <footer className="app-footer"><span className="status-dot"/>{text}<span className="header-spacer"/><span><ShieldCheck size={12}/>파일 처리는 이 기기에서 · 클라우드 저장은 선택</span></footer>; }
export function UploadBox({id, title, detail, fileName, disabled, accept, multiple, onFiles, onRemove}: {id: string; title: string; detail: string; fileName?: string; disabled?: boolean; accept: string; multiple?: boolean; onFiles: (files: File[]) => void; onRemove?: () => void}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return <div className={`upload-box ${fileName ? "has-file" : ""} ${dragging ? "dragging" : ""}`} onDragOver={e => {e.preventDefault(); if (!disabled) setDragging(true);}} onDragLeave={() => setDragging(false)} onDrop={e => {e.preventDefault();setDragging(false);if(!disabled) onFiles(Array.from(e.dataTransfer.files));}}>
    <input ref={input} className="visually-hidden" id={id} aria-label={title} type="file" accept={accept} multiple={multiple} disabled={disabled} onChange={e => {onFiles(Array.from(e.target.files || []));e.target.value="";}}/>
    <button className="upload-target" disabled={disabled} aria-label={`${title}${fileName ? " 변경" : " 선택"}`} onClick={() => input.current?.click()}>{fileName ? <FileText size={20}/> : <Upload size={20}/>}<span><strong>{fileName || title}</strong><small>{detail}</small></span>{fileName && <span className="replace-label">변경</span>}</button>
    {fileName && onRemove && <button className="icon-button remove-file" disabled={disabled} aria-label={`${title} 제거`} onClick={onRemove}><X size={14}/></button>}
  </div>;
}
export function useConfirmation() {
  const [pending, setPending] = useState<{title: string; description: string; action: () => void} | null>(null);
  function ask(title: string, description: string, action: () => void) {setPending({title, description, action});}
  return {ask, dialog: <Confirmation pending={pending} cancel={() => setPending(null)} confirm={() => {const action = pending?.action;setPending(null);action?.();}}/>};
}
function Confirmation({pending, cancel, confirm}: {pending: {title: string; description: string} | null; cancel: () => void; confirm: () => void}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {if(pending && !ref.current?.open) ref.current?.showModal();else if(!pending && ref.current?.open) ref.current?.close();}, [pending]);
  return <dialog ref={ref} className="confirm-dialog" onCancel={cancel} aria-labelledby="confirm-title"><h2 id="confirm-title">{pending?.title}</h2><p>{pending?.description}</p><div className="dialog-actions"><button autoFocus onClick={cancel}>취소</button><button className="primary" onClick={confirm}>계속하기</button></div></dialog>;
}
export function useLoginDraft(key: string, payload: () => unknown, restore: (p: any) => void, hasWork: boolean, onMessage: (s: string) => void) {
  const restoreRef = useRef(restore);restoreRef.current = restore;
  useEffect(() => {
    try {const saved = sessionStorage.getItem(key);if(!saved) return;sessionStorage.removeItem(key);const draft = JSON.parse(saved);if(Date.now()-draft.savedAt > 30*60*1000) return;restoreRef.current(draft.payload);onMessage("로그인 전에 하던 작업을 복원했습니다.");} catch {onMessage("임시 작업을 복원하지 못했습니다. 원본 파일을 다시 추가해 주세요.");}
  }, [key]);
  return (event: React.MouseEvent<HTMLAnchorElement>) => {
    if(!hasWork) return;
    try {sessionStorage.setItem(key, JSON.stringify({savedAt: Date.now(), payload: payload()}));}
    catch {event.preventDefault();onMessage("이 작업은 로그인 중 임시 보관하기에 너무 큽니다. 결과를 먼저 다운로드한 후 로그인해 주세요.");}
  };
}
type SavedProject = {id: string; title: string; created_at: string};
export function useCloud(signedIn: boolean, onLoad: (p: any) => void) {
  const [history, setHistory] = useState<SavedProject[]>([]), [cloudStatus, setCloudStatus] = useState(""), [pending, setPending] = useState(false);
  const locked = useRef(false);
  async function refresh() {if(!signedIn) return;const response = await fetch("/api/projects");const data: any = await response.json();if(!response.ok) throw Error(data.error || "작업 목록을 불러오지 못했습니다.");setHistory(data.projects);}
  useEffect(() => {refresh().catch(error => setCloudStatus(error.message));}, [signedIn]);
  async function operation(action: () => Promise<void>) {if(locked.current) return;locked.current = true;setPending(true);try {await action();}catch(error) {setCloudStatus((error as Error).message);}finally {locked.current = false;setPending(false);}}
  async function save(title: string, payload: unknown) {return operation(async () => {setCloudStatus("작업을 저장하고 있습니다…");const response = await fetch("/api/projects", {method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({title, payload})});const data: any = await response.json();if(!response.ok) throw Error(data.error || "저장하지 못했습니다.");await refresh();setCloudStatus("작업을 클라우드에 저장했습니다.");});}
  async function load(id: string) {return operation(async () => {const response = await fetch("/api/projects?id="+encodeURIComponent(id));const data = await response.json();if(!response.ok) throw Error((data as any).error || "작업을 불러오지 못했습니다.");onLoad(data);setCloudStatus("저장한 작업을 불러왔습니다.");});}
  async function remove(id: string) {return operation(async () => {const response = await fetch("/api/projects?id="+encodeURIComponent(id), {method:"DELETE"});if(!response.ok) throw Error("작업을 삭제하지 못했습니다.");await refresh();setCloudStatus("저장한 작업과 파일을 삭제했습니다.");});}
  return {history, cloudStatus, pending, save, load, remove, clearStatus: () => setCloudStatus("")};
}
export function History({cloud, signedIn, beforeLoad}: {cloud: ReturnType<typeof useCloud>; signedIn: boolean; beforeLoad: (action: () => void) => void}) {
  const confirmation = useConfirmation();
  if(!signedIn) return null;
  return <details className="side-details"><summary><FolderOpen size={15}/>저장한 작업 <span className="count">{cloud.history.length}</span><ChevronDown size={14}/></summary><div className="details-body">{cloud.history.length === 0 && <p>상단의 ‘작업 저장’을 누르면 여기에 보관됩니다.</p>}{cloud.history.map(project => <div className="history-item" key={project.id}><button disabled={cloud.pending} onClick={() => beforeLoad(() => cloud.load(project.id))} title={project.title}><strong>{project.title}</strong><small>{new Date(project.created_at).toLocaleDateString("ko-KR")}</small></button><button className="icon-button" disabled={cloud.pending} aria-label={`${project.title} 삭제`} onClick={() => confirmation.ask("저장한 작업을 삭제할까요?", "클라우드의 저장본과 처리 데이터를 삭제합니다. 이 작업은 되돌릴 수 없습니다.", () => cloud.remove(project.id))}><Trash2 size={14}/></button></div>)}</div>{confirmation.dialog}</details>;
}
export function Help({children}: {children: ReactNode}) {return <details className="side-details"><summary><ShieldCheck size={15}/>지원 범위와 데이터 보관<ChevronDown size={14}/></summary><div className="details-body">{children}<p>파일은 이 기기에서 처리됩니다. 클라우드에 명시적으로 저장할 때만 처리 데이터와 설정을 전송합니다. 원본 파일은 업로드하지 않습니다. 저장본은 삭제 전까지 보관되며 작업당 8MB, 최대 40개입니다.</p><p>로그인할 때만 현재 작업을 이 탭에 임시 보관합니다. 30분 이내에 복원하며, 복원하거나 다음에 앱을 열 때 임시본을 삭제합니다.</p></div></details>;}
export function UndoNotice({message, undo}: {message: string; undo: () => void}) {return <div className="message undo-message" role="status"><span>{message}</span><button onClick={undo}><RotateCcw size={14}/>되돌리기</button></div>;}
