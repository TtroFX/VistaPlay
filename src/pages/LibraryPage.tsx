import { Archive, BarChart3, ChevronDown, ChevronRight, Folder, FolderPlus, Heart, Library, NotebookPen, Pin, Tags, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { NoteEditor } from '../components/NoteEditor'
import { VideoCard } from '../components/VideoCard'
import type { Folder as FolderModel, SmartCondition, SmartConditionGroup, SmartFolder } from '../domain/types'
import { evaluateSmartFolder, smartFolderUsesField } from '../lib/smartFolders'
import { useTemporaryHistory } from '../lib/useTemporaryHistory'
import { useApp } from '../store/AppStore'

type Tab = 'favorites' | 'later' | 'folders' | 'tags' | 'smart' | 'archived'

const watchStateLabels: Record<string, string> = { UNWATCHED: '未視聴', WATCHING: '視聴中', COMPLETED: '視聴済み', ARCHIVED: 'Archive済み' }
const smartFieldLabels: Record<SmartCondition['field'], string> = {
  favorite: 'お気に入り', watchState: '視聴状態', tag: 'Tag', channel: 'Channel', category: 'Category', duration: '動画時間', addedDate: '追加日', publishedDate: '公開日'
}

function describeCondition(condition: SmartCondition): string {
  if (condition.field === 'favorite') return condition.value ? 'お気に入りである' : 'お気に入りではない'
  if (condition.field === 'watchState') return watchStateLabels[String(condition.value)] ?? `視聴状態が${String(condition.value)}`
  if (condition.field === 'duration') {
    const minutes = Math.round(Number(condition.value) / 6) / 10
    return condition.op === 'gt' ? `動画時間が${minutes}分以上` : condition.op === 'lt' ? `動画時間が${minutes}分未満` : `動画時間が${minutes}分`
  }
  if (condition.field === 'addedDate') return condition.op === 'lt' ? `${condition.value}日以内に追加` : `追加から${condition.value}日以上`
  if (condition.field === 'publishedDate') return condition.op === 'lt' ? `${condition.value}日以内に公開` : `公開から${condition.value}日以上`
  const noun = smartFieldLabels[condition.field]
  return condition.op === 'contains' ? `${noun}に「${String(condition.value)}」を含む` : `${noun}が「${String(condition.value)}」`
}

function folderDepth(folder: FolderModel, folders: FolderModel[]): number {
  let depth = 0
  let current = folder
  const visited = new Set<string>()
  while (current.parentId && !visited.has(current.id)) {
    visited.add(current.id)
    const parent = folders.find((item) => item.id === current.parentId)
    if (!parent) break
    depth += 1
    current = parent
  }
  return depth
}

function folderTrail(folder: FolderModel, folders: FolderModel[]): FolderModel[] {
  const trail: FolderModel[] = [folder]
  const visited = new Set([folder.id])
  let current = folder
  while (current.parentId) {
    const parent = folders.find((item) => item.id === current.parentId)
    if (!parent || visited.has(parent.id)) break
    visited.add(parent.id)
    trail.unshift(parent)
    current = parent
  }
  return trail
}

export default function LibraryPage() {
  const app = useApp(); const navigate = useNavigate(); const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>('favorites'); const [folderName, setFolderName] = useState(''); const [folderParent, setFolderParent] = useState(''); const [selectedFolderId, setSelectedFolderId] = useState(''); const [selectedTagId, setSelectedTagId] = useState(''); const [selectedSmartFolderId, setSelectedSmartFolderId] = useState(''); const [tagName, setTagName] = useState('')
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set())
  const [smartName, setSmartName] = useState(''); const [smartField, setSmartField] = useState<SmartCondition['field']>('favorite'); const [smartOp, setSmartOp] = useState<SmartCondition['op']>('eq'); const [smartValue, setSmartValue] = useState('true'); const [smartOperator, setSmartOperator] = useState<SmartFolder['operator']>('and'); const [smartGroupOperator, setSmartGroupOperator] = useState<SmartFolder['operator']>('and'); const [smartConditions, setSmartConditions] = useState<SmartCondition[]>([]); const [smartGroups, setSmartGroups] = useState<SmartConditionGroup[]>([])
  const organizeId = params.get('organize'); const video = organizeId ? app.state.videos[organizeId] : undefined
  const dismissOrganize = useTemporaryHistory(Boolean(video), () => setParams({}, { replace: true }), 'organize-video')
  const ids = tab === 'favorites' ? app.state.favorites : tab === 'later' ? app.state.watchLater : tab === 'archived' ? Object.values(app.state.history).filter((p) => p.state === 'ARCHIVED').map((p) => p.videoId) : []
  const videos = ids.map((id) => app.state.videos[id]).filter(Boolean)
  const tagsEnabled = app.feature('tags')
  const smartResults = useMemo(() => Object.fromEntries(app.state.smartFolders.map((folder) => [folder.id, !tagsEnabled && smartFolderUsesField(folder, 'tag') ? [] : evaluateSmartFolder(folder, app.state)])), [app.state, tagsEnabled])
  const selectedFolder = app.state.folders.find((folder) => folder.id === selectedFolderId)
  const folderVideos = selectedFolder?.videoIds.map((id) => app.state.videos[id]).filter(Boolean) ?? []
  const selectedTag = app.state.tags.find((tag) => tag.id === selectedTagId)
  const tagVideos = selectedTag?.videoIds.map((id) => app.state.videos[id]).filter(Boolean) ?? []
  const selectedSmartFolder = app.state.smartFolders.find((folder) => folder.id === selectedSmartFolderId)
  const selectedSmartVideos = selectedSmartFolder ? smartResults[selectedSmartFolder.id] ?? [] : []
  const selectedSmartUnavailable = Boolean(selectedSmartFolder && !tagsEnabled && smartFolderUsesField(selectedSmartFolder, 'tag'))
  const rootFolders = useMemo(() => app.state.folders.filter((folder) => !folder.parentId).sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name, 'ja')), [app.state.folders])
  const childrenByParent = useMemo(() => {
    const map = new Map<string, FolderModel[]>()
    for (const folder of app.state.folders) if (folder.parentId) map.set(folder.parentId, [...(map.get(folder.parentId) ?? []), folder])
    for (const items of map.values()) items.sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name, 'ja'))
    return map
  }, [app.state.folders])

  useEffect(() => {
    if ((tab === 'tags' && !app.feature('tags')) || (tab === 'smart' && !app.feature('smartFolders'))) setTab('favorites')
    if (!tagsEnabled && smartField === 'tag') chooseSmartField('favorite')
  }, [app.feature, smartField, tab, tagsEnabled])

  function chooseSmartField(field: SmartCondition['field']) {
    setSmartField(field)
    if (field === 'favorite') { setSmartOp('eq'); setSmartValue('true') }
    else if (field === 'watchState') { setSmartOp('eq'); setSmartValue('UNWATCHED') }
    else if (field === 'duration') { setSmartOp('gt'); setSmartValue('10') }
    else if (field === 'addedDate' || field === 'publishedDate') { setSmartOp('lt'); setSmartValue('7') }
    else { setSmartOp('contains'); setSmartValue('') }
  }

  const addSmartCondition = () => {
    if (!smartValue.trim()) return
    let value: SmartCondition['value'] = smartValue.trim()
    let op = smartOp
    if (smartField === 'favorite') { value = smartValue === 'true'; op = 'eq' }
    else if (smartField === 'duration') { value = Number(smartValue) * 60 }
    else if (smartField === 'addedDate' || smartField === 'publishedDate') value = Number(smartValue)
    else if (smartField === 'watchState') op = 'eq'
    if (typeof value === 'number' && !Number.isFinite(value)) return
    setSmartConditions((items) => [...items, { field: smartField, op, value }])
  }
  const addSmartGroup = () => {
    if (!smartConditions.length) return
    setSmartGroups((groups) => [...groups, { operator: smartGroupOperator, conditions: smartConditions }])
    setSmartConditions([])
  }
  const createSmart = () => {
    const groups = smartConditions.length ? [...smartGroups, { operator: smartGroupOperator, conditions: smartConditions }] : smartGroups
    if (!smartName.trim() || !groups.length) return
    const folder: SmartFolder = { id: crypto.randomUUID(), name: smartName.trim(), operator: smartOperator, conditions: groups.flatMap((group) => group.conditions), groups, updatedAt: new Date().toISOString() }
    app.replaceState((current) => ({ ...current, smartFolders: [...current.smartFolders, folder] })); setSmartName(''); setSmartConditions([]); setSmartGroups([])
  }

  function deleteFolder(folder: FolderModel) {
    if (!confirm('Folderを完全に削除しますか？動画自体は削除されません。')) return
    const remove = new Set<string>([folder.id])
    let changed = true
    while (changed) {
      changed = false
      for (const candidate of app.state.folders) if (candidate.parentId && remove.has(candidate.parentId) && !remove.has(candidate.id)) { remove.add(candidate.id); changed = true }
    }
    if (selectedFolderId && remove.has(selectedFolderId)) setSelectedFolderId('')
    app.replaceState((current) => ({ ...current, folders: current.folders.filter((item) => !remove.has(item.id)) }))
  }

  function renderFolder(folder: FolderModel, depth = 0): React.ReactNode {
    const children = childrenByParent.get(folder.id) ?? []
    const collapsed = collapsedFolders.has(folder.id)
    return <div className="folder-tree-node" key={folder.id} style={{ '--folder-depth': depth } as React.CSSProperties}>
      <article className={`folder-card ${depth ? 'subfolder' : ''} ${selectedFolderId === folder.id ? 'selected' : ''}`}>
        <button className="folder-chevron icon-button" disabled={!children.length} aria-label={children.length ? `${folder.name}の子Folderを${collapsed ? '表示' : '非表示'}` : '子Folderなし'} onClick={() => setCollapsedFolders((current) => { const next = new Set(current); if (next.has(folder.id)) next.delete(folder.id); else next.add(folder.id); return next })}>{children.length ? collapsed ? <ChevronRight /> : <ChevronDown /> : <span className="tree-dot" />}</button>
        <div className="folder-icon"><Folder /></div>
        <button className="folder-open" onClick={() => setSelectedFolderId(folder.id)}><strong>{folder.name}</strong><span>{folder.videoIds.length}本 · {depth ? '子Folder' : 'Root'}{children.length ? ` · ${children.length} Folder` : ''}</span></button>
        <button className="icon-button" aria-label={`${folder.name}を${folder.pinned ? 'Pin解除' : 'Pin'}`} onClick={() => app.replaceState((current) => ({ ...current, folders: current.folders.map((item) => item.id === folder.id ? { ...item, pinned: !item.pinned, updatedAt: new Date().toISOString() } : item) }))}><Pin fill={folder.pinned ? 'currentColor' : 'none'} /></button>
        <button className="icon-button danger-hover" aria-label={`${folder.name}を削除`} onClick={() => deleteFolder(folder)}><Trash2 /></button>
      </article>
      {!collapsed && children.length > 0 && <div className="folder-children">{children.map((child) => renderFolder(child, depth + 1))}</div>}
    </div>
  }

  function smartValueControl() {
    if (smartField === 'favorite') return <select value={smartValue} onChange={(event) => setSmartValue(event.target.value)} aria-label="お気に入り条件"><option value="true">お気に入りである</option><option value="false">お気に入りではない</option></select>
    if (smartField === 'watchState') return <select value={smartValue} onChange={(event) => setSmartValue(event.target.value)} aria-label="視聴状態"><option value="UNWATCHED">未視聴</option><option value="WATCHING">視聴中</option><option value="COMPLETED">視聴済み</option><option value="ARCHIVED">Archive済み</option></select>
    const numeric = smartField === 'duration' || smartField === 'addedDate' || smartField === 'publishedDate'
    return <label className="smart-value-input"><input type={numeric ? 'number' : 'text'} min={numeric ? 0 : undefined} step={smartField === 'duration' ? .5 : 1} value={smartValue} onChange={(event) => setSmartValue(event.target.value)} placeholder={smartField === 'tag' ? 'Tag名' : smartField === 'channel' ? 'Channel名 / ID' : smartField === 'category' ? 'Category' : '条件値'} />{smartField === 'duration' ? <span>分</span> : smartField === 'addedDate' || smartField === 'publishedDate' ? <span>日</span> : null}</label>
  }

  return <div className="page"><div className="page-heading"><div><span className="eyebrow">YOUR COLLECTION</span><h1>Library</h1><p>Favorite・後で見る・Folder・Tagは相互排他ではありません。</p></div>{app.feature('statistics') && <button className="secondary-button" onClick={() => navigate('/statistics')}><BarChart3 />Statistics</button>}</div>
    <div className="tabs" role="tablist">{([['favorites', 'Favorites', Heart], ['later', 'Watch Later', Library], ['folders', 'Folders', Folder], ...(app.feature('tags') ? [['tags', 'Tags', Tags]] : []), ...(app.feature('smartFolders') ? [['smart', 'Smart Folders', Pin]] : []), ['archived', 'Archived', Archive]] as Array<[Tab, string, typeof Heart]>).map(([key, label, Icon]) => <button role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)} key={key}><Icon />{label}</button>)}</div>
    {(tab === 'favorites' || tab === 'later' || tab === 'archived') && (videos.length ? <div className="video-grid">{videos.map((item) => <VideoCard video={item} key={item.videoId} />)}</div> : <EmptyState icon={Library} title="このCollectionは空です" description="Video Cardの管理メニューから追加できます。" />)}
    {tab === 'folders' && <>
      <div className="inline-form folder-create-form"><input value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="新しいFolder名" maxLength={80} /><select value={folderParent} onChange={(event) => setFolderParent(event.target.value)} aria-label="親Folder"><option value="">Rootに作成</option>{rootFolders.map((folder) => <option value={folder.id} key={folder.id}>↳ {folder.name} の中</option>)}</select><button className="primary-button" disabled={!folderName.trim()} onClick={() => { app.addFolder(folderName, folderParent || undefined); setFolderName('') }}><FolderPlus />作成</button></div>
      <div className="folder-tree" role="tree">{rootFolders.map((folder) => renderFolder(folder))}</div>
      {selectedFolder && <section className="collection-results"><nav className="folder-breadcrumb" aria-label="Folder階層"><button onClick={() => setSelectedFolderId('')}>Folders</button>{folderTrail(selectedFolder, app.state.folders).map((item) => <span key={item.id}><ChevronRight /><button className={item.id === selectedFolder.id ? 'current' : ''} onClick={() => setSelectedFolderId(item.id)}>{item.name}</button></span>)}</nav><div className="section-heading"><div><span className="section-kicker"><Folder /></span><h2>{selectedFolder.name}</h2></div><span>{folderVideos.length}本 · 深さ{folderDepth(selectedFolder, app.state.folders) + 1}</span></div>{folderVideos.length ? <div className="video-grid">{folderVideos.map((item) => <VideoCard video={item} key={item.videoId} />)}</div> : <EmptyState icon={Folder} title="このFolderは空です" description="Video Cardの管理メニューから複数のFolderへ追加できます。" />}</section>}
    </>}
    {tab === 'tags' && <><p>Tagは各Video Cardの「Folder / Tags」から追加・解除できます。</p><div className="tag-cloud">{app.state.tags.map((tag) => <button className={`tag-chip ${selectedTagId === tag.id ? 'active' : ''}`} style={{ '--tag-color': tag.color ?? app.state.settings.theme.accent } as React.CSSProperties} key={tag.id} onClick={() => setSelectedTagId(tag.id)}><span />{tag.display}<small>{tag.videoIds.length}</small></button>)}</div>{selectedTag && <section className="collection-results"><div className="section-heading"><div><span className="section-kicker"><Tags /></span><h2>{selectedTag.display}</h2></div><span>{tagVideos.length}本</span></div>{tagVideos.length ? <div className="video-grid">{tagVideos.map((item) => <VideoCard video={item} key={item.videoId} />)}</div> : <EmptyState icon={Tags} title="このTagに動画はありません" description="整理画面から動画へTagを追加できます。" />}</section>}</>}
    {tab === 'smart' && <>
      <div className="smart-builder natural-smart-builder">
        <input value={smartName} onChange={(event) => setSmartName(event.target.value)} placeholder="Smart Folder名" />
        <label>Group間<select value={smartOperator} onChange={(event) => setSmartOperator(event.target.value as SmartFolder['operator'])}><option value="and">すべてのGroupに一致</option><option value="or">いずれかのGroupに一致</option></select></label>
        <label>Group内<select value={smartGroupOperator} onChange={(event) => setSmartGroupOperator(event.target.value as SmartFolder['operator'])}><option value="and">すべての条件に一致</option><option value="or">いずれかの条件に一致</option></select></label>
        <label>条件<select value={smartField} onChange={(event) => chooseSmartField(event.target.value as SmartCondition['field'])}><option value="favorite">お気に入り</option><option value="watchState">視聴状態</option><option value="channel">Channel</option><option value="category">Category</option>{tagsEnabled && <option value="tag">Tag</option>}<option value="duration">動画時間</option><option value="addedDate">追加日</option><option value="publishedDate">公開日</option></select></label>
        {!['favorite', 'watchState'].includes(smartField) && <label>判定<select value={smartOp} onChange={(event) => setSmartOp(event.target.value as SmartCondition['op'])}>{smartField === 'duration' || smartField === 'addedDate' || smartField === 'publishedDate' ? <><option value="lt">以内 / 未満</option><option value="gt">以上 / より前</option></> : <><option value="contains">含む</option><option value="eq">一致する</option></>}</select></label>}
        {smartValueControl()}
        <button className="secondary-button" onClick={addSmartCondition}>条件を追加</button><button className="secondary-button" onClick={addSmartGroup} disabled={!smartConditions.length}>このGroupを確定</button><button className="primary-button" onClick={createSmart} disabled={!smartName.trim() || (!smartConditions.length && !smartGroups.length)}>作成</button>
      </div>
      {smartGroups.length > 0 && <div className="smart-group-list">{smartGroups.map((group, groupIndex) => <div key={groupIndex}><strong>Group {groupIndex + 1}</strong><span>{group.conditions.map(describeCondition).join(' ・ ')}</span><button className="text-button" onClick={() => setSmartGroups((groups) => groups.filter((_, index) => index !== groupIndex))}>削除</button></div>)}</div>}
      {smartConditions.length > 0 && <div className="condition-chips"><strong>編集中Group · {smartGroupOperator === 'and' ? 'すべて' : 'いずれか'}</strong>{smartConditions.map((condition, index) => <button className="filter-chip active" key={`${condition.field}-${index}`} onClick={() => setSmartConditions((items) => items.filter((_, itemIndex) => itemIndex !== index))}>{describeCondition(condition)}<X /></button>)}</div>}
      <div className="smart-folder-list">{app.state.smartFolders.map((folder) => { const unavailable = !tagsEnabled && smartFolderUsesField(folder, 'tag'); const preview = (folder.groups?.[0]?.conditions ?? folder.conditions).slice(0, 3).map(describeCondition).join(' ・ '); return <article className={`smart-folder-card ${selectedSmartFolderId === folder.id ? 'selected' : ''}`} key={folder.id}><div><Pin /><strong>{folder.name}</strong><span>{preview || `${folder.conditions.length}条件`}</span></div><p>{unavailable ? 'Tags OFF中はTag条件を評価しません' : `${smartResults[folder.id]?.length ?? 0}件 — 条件から自動集計`}</p><div className="mini-video-row">{smartResults[folder.id]?.slice(0, 4).map((item) => <img key={item.videoId} src={item.thumbnail} alt="" />)}</div><button className="secondary-button" disabled={unavailable} onClick={() => setSelectedSmartFolderId(folder.id)}>結果を開く</button><button className="danger-text" onClick={() => confirm('Smart Folderを削除しますか？') && app.replaceState((current) => ({ ...current, smartFolders: current.smartFolders.filter((item) => item.id !== folder.id) }))}>Delete</button></article> })}</div>
      {selectedSmartFolder && <section className="collection-results"><div className="section-heading"><div><span className="section-kicker"><Pin /></span><h2>{selectedSmartFolder.name}</h2></div><span>{selectedSmartUnavailable ? '依存Feature OFF' : `${selectedSmartVideos.length}本`}</span></div>{selectedSmartUnavailable ? <EmptyState icon={Tags} title="TagsがOFFです" description="設定は保持されています。TagsをONにするとこのSmart Folderを再評価します。" /> : selectedSmartVideos.length ? <div className="video-grid">{selectedSmartVideos.map((item) => <VideoCard video={item} key={item.videoId} />)}</div> : <EmptyState icon={Pin} title="条件に一致する動画がありません" description="Libraryデータが更新されると自動で再評価されます。" />}</section>}
    </>}
    {video && <div className="modal-backdrop" onClick={() => dismissOrganize()}><section className="modal organize-modal" role="dialog" aria-modal="true" aria-label="動画を整理" onClick={(e) => e.stopPropagation()}><button className="modal-close icon-button" onClick={() => dismissOrganize()}><X /></button><div className="modal-heading"><img src={video.thumbnail} alt="" /><div><span className="eyebrow">ORGANIZE</span><h2>{video.title}</h2></div></div><h3>Folders</h3><div className="choice-list hierarchical-choice-list">{[...app.state.folders].sort((a, b) => folderDepth(a, app.state.folders) - folderDepth(b, app.state.folders) || a.name.localeCompare(b.name, 'ja')).map((folder) => <label key={folder.id} style={{ '--folder-depth': folderDepth(folder, app.state.folders) } as React.CSSProperties}><input type="checkbox" checked={folder.videoIds.includes(video.videoId)} onChange={() => app.toggleFolderVideo(folder.id, video.videoId)} /><span>{folder.parentId ? '↳ ' : ''}{folder.name}</span></label>)}</div><div className="inline-form"><input value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder="新しいFolder" /><button onClick={() => { app.addFolder(folderName); setFolderName('') }}>追加</button></div>{app.feature('tags') && <><h3>Tags</h3><div className="tag-cloud">{app.state.tags.filter((tag) => tag.videoIds.includes(video.videoId)).map((tag) => <button className="tag-chip" key={tag.id} onClick={() => app.removeTag(tag.id, video.videoId)}>{tag.display}<X /></button>)}</div><div className="inline-form"><input value={tagName} onChange={(e) => setTagName(e.target.value)} placeholder="Tag（32文字まで）" maxLength={32} /><button onClick={() => { app.addTag(tagName, video.videoId); setTagName('') }}>追加</button></div></>}<h3><NotebookPen />Note</h3><NoteEditor key={video.videoId} videoId={video.videoId} initialValue={app.state.notes.find((note) => note.videoId === video.videoId)?.text ?? ''} onSave={app.saveNote} placeholder="Plain text note（入力停止後に自動保存）" /></section></div>}
  </div>
}
