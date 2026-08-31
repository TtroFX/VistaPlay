import { Archive, BarChart3, Folder, FolderPlus, Heart, Library, NotebookPen, Pin, Tags, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { NoteEditor } from '../components/NoteEditor'
import { VideoCard } from '../components/VideoCard'
import type { SmartCondition, SmartConditionGroup, SmartFolder } from '../domain/types'
import { evaluateSmartFolder, smartFolderUsesField } from '../lib/smartFolders'
import { useTemporaryHistory } from '../lib/useTemporaryHistory'
import { useApp } from '../store/AppStore'

type Tab = 'favorites' | 'later' | 'folders' | 'tags' | 'smart' | 'archived'

export default function LibraryPage() {
  const app = useApp(); const navigate = useNavigate(); const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>('favorites'); const [folderName, setFolderName] = useState(''); const [folderParent, setFolderParent] = useState(''); const [selectedFolderId, setSelectedFolderId] = useState(''); const [selectedTagId, setSelectedTagId] = useState(''); const [selectedSmartFolderId, setSelectedSmartFolderId] = useState(''); const [tagName, setTagName] = useState('')
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
  useEffect(() => {
    if ((tab === 'tags' && !app.feature('tags')) || (tab === 'smart' && !app.feature('smartFolders'))) setTab('favorites')
    if (!tagsEnabled && smartField === 'tag') setSmartField('favorite')
  }, [app.feature, smartField, tab, tagsEnabled])
  const addSmartCondition = () => {
    if (!smartValue.trim()) return
    const numeric = smartField === 'duration' || smartField === 'addedDate' || smartField === 'publishedDate'
    const value = smartField === 'favorite' ? smartValue === 'true' : numeric ? Number(smartValue) : smartValue.trim()
    if (numeric && !Number.isFinite(value)) return
    setSmartConditions((items) => [...items, { field: smartField, op: smartOp, value }])
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
  return <div className="page"><div className="page-heading"><div><span className="eyebrow">YOUR COLLECTION</span><h1>Library</h1><p>Favorite・後で見る・Folder・Tagは相互排他ではありません。</p></div>{app.feature('statistics') && <button className="secondary-button" onClick={() => navigate('/statistics')}><BarChart3 />Statistics</button>}</div>
    <div className="tabs" role="tablist">{([['favorites', 'Favorites', Heart], ['later', 'Watch Later', Library], ['folders', 'Folders', Folder], ...(app.feature('tags') ? [['tags', 'Tags', Tags]] : []), ...(app.feature('smartFolders') ? [['smart', 'Smart Folders', Pin]] : []), ['archived', 'Archived', Archive]] as Array<[Tab, string, typeof Heart]>).map(([key, label, Icon]) => <button role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)} key={key}><Icon />{label}</button>)}</div>
    {(tab === 'favorites' || tab === 'later' || tab === 'archived') && (videos.length ? <div className="video-grid">{videos.map((item) => <VideoCard video={item} key={item.videoId} />)}</div> : <EmptyState icon={Library} title="このCollectionは空です" description="Video Cardの管理メニューから追加できます。" />)}
    {tab === 'folders' && <>
      <div className="inline-form folder-create-form">
        <input value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="新しいFolder名" maxLength={80} />
        <select value={folderParent} onChange={(event) => setFolderParent(event.target.value)} aria-label="親Folder"><option value="">Root Folder</option>{app.state.folders.filter((folder) => !folder.parentId).map((folder) => <option value={folder.id} key={folder.id}>{folder.name} の中</option>)}</select>
        <button className="primary-button" disabled={!folderName.trim()} onClick={() => { app.addFolder(folderName, folderParent || undefined); setFolderName('') }}><FolderPlus />作成</button>
      </div>
      <div className="folder-grid">{[...app.state.folders].sort((a, b) => Number(Boolean(a.parentId)) - Number(Boolean(b.parentId)) || Number(b.pinned) - Number(a.pinned)).map((folder) => {
        const parent = folder.parentId ? app.state.folders.find((candidate) => candidate.id === folder.parentId) : undefined
        return <article className={`folder-card ${folder.parentId ? 'subfolder' : ''} ${selectedFolderId === folder.id ? 'selected' : ''}`} key={folder.id}><div className="folder-icon"><Folder /></div><button className="folder-open" onClick={() => setSelectedFolderId(folder.id)}><strong>{folder.name}</strong><span>{folder.videoIds.length}本 · {parent ? `${parent.name} / Subfolder` : 'Root'}</span></button><button className="icon-button" aria-label={`${folder.name}を${folder.pinned ? 'Pin解除' : 'Pin'}`} onClick={() => app.replaceState((current) => ({ ...current, folders: current.folders.map((item) => item.id === folder.id ? { ...item, pinned: !item.pinned, updatedAt: new Date().toISOString() } : item) }))}><Pin fill={folder.pinned ? 'currentColor' : 'none'} /></button><button className="icon-button danger-hover" aria-label={`${folder.name}を削除`} onClick={() => { if (!confirm('Folderを完全に削除しますか？動画自体は削除されません。')) return; if (selectedFolderId === folder.id || app.state.folders.some((item) => item.parentId === folder.id && item.id === selectedFolderId)) setSelectedFolderId(''); app.replaceState((current) => ({ ...current, folders: current.folders.filter((item) => item.id !== folder.id && item.parentId !== folder.id) })) }}><Trash2 /></button></article>
      })}</div>
      {selectedFolder && <section className="collection-results"><div className="section-heading"><div><span className="section-kicker"><Folder /></span><h2>{selectedFolder.name}</h2></div><span>{folderVideos.length}本</span></div>{folderVideos.length ? <div className="video-grid">{folderVideos.map((item) => <VideoCard video={item} key={item.videoId} />)}</div> : <EmptyState icon={Folder} title="このFolderは空です" description="Video Cardの管理メニューから複数のFolderへ追加できます。" />}</section>}
    </>}
    {tab === 'tags' && <><p>Tagは各Video Cardの「Folder / Tags」から追加・解除できます。</p><div className="tag-cloud">{app.state.tags.map((tag) => <button className={`tag-chip ${selectedTagId === tag.id ? 'active' : ''}`} style={{ '--tag-color': tag.color ?? app.state.settings.theme.accent } as React.CSSProperties} key={tag.id} onClick={() => setSelectedTagId(tag.id)}><span />{tag.display}<small>{tag.videoIds.length}</small></button>)}</div>{selectedTag && <section className="collection-results"><div className="section-heading"><div><span className="section-kicker"><Tags /></span><h2>{selectedTag.display}</h2></div><span>{tagVideos.length}本</span></div>{tagVideos.length ? <div className="video-grid">{tagVideos.map((item) => <VideoCard video={item} key={item.videoId} />)}</div> : <EmptyState icon={Tags} title="このTagに動画はありません" description="整理画面から動画へTagを追加できます。" />}</section>}</>}
    {tab === 'smart' && <>
      <div className="smart-builder">
        <input value={smartName} onChange={(event) => setSmartName(event.target.value)} placeholder="Smart Folder名" />
        <label>Group間<select value={smartOperator} onChange={(event) => setSmartOperator(event.target.value as SmartFolder['operator'])}><option value="and">すべてのGroup（AND）</option><option value="or">いずれかのGroup（OR）</option></select></label>
        <label>Group内<select value={smartGroupOperator} onChange={(event) => setSmartGroupOperator(event.target.value as SmartFolder['operator'])}><option value="and">すべての条件（AND）</option><option value="or">いずれかの条件（OR）</option></select></label>
        <select value={smartField} onChange={(event) => setSmartField(event.target.value as SmartCondition['field'])}><option value="favorite">Favorite</option><option value="channel">Channel</option><option value="category">Category</option>{tagsEnabled && <option value="tag">Tag</option>}<option value="duration">Duration</option><option value="watchState">Watch State</option><option value="addedDate">Added age（日）</option><option value="publishedDate">Published age（日）</option></select>
        <select value={smartOp} onChange={(event) => setSmartOp(event.target.value as SmartCondition['op'])}><option value="eq">Equals</option><option value="contains">Contains</option><option value="lt">Less than</option><option value="gt">Greater than</option></select>
        <input value={smartValue} onChange={(event) => setSmartValue(event.target.value)} placeholder="条件値" />
        <button className="secondary-button" onClick={addSmartCondition}>条件を追加</button><button className="secondary-button" onClick={addSmartGroup} disabled={!smartConditions.length}>このGroupを確定</button><button className="primary-button" onClick={createSmart} disabled={!smartName.trim() || (!smartConditions.length && !smartGroups.length)}>作成</button>
      </div>
      {smartGroups.length > 0 && <div className="smart-group-list">{smartGroups.map((group, groupIndex) => <div key={groupIndex}><strong>Group {groupIndex + 1} · {group.operator.toUpperCase()}</strong><span>{group.conditions.length}条件</span><button className="text-button" onClick={() => setSmartGroups((groups) => groups.filter((_, index) => index !== groupIndex))}>削除</button></div>)}</div>}
      {smartConditions.length > 0 && <div className="condition-chips"><strong>編集中Group · {smartGroupOperator.toUpperCase()}</strong>{smartConditions.map((condition, index) => <button className="filter-chip active" key={`${condition.field}-${index}`} onClick={() => setSmartConditions((items) => items.filter((_, itemIndex) => itemIndex !== index))}>{condition.field} {condition.op} {String(condition.value)}<X /></button>)}</div>}
      <div className="smart-folder-list">{app.state.smartFolders.map((folder) => { const unavailable = !tagsEnabled && smartFolderUsesField(folder, 'tag'); return <article className={`smart-folder-card ${selectedSmartFolderId === folder.id ? 'selected' : ''}`} key={folder.id}><div><Pin /><strong>{folder.name}</strong><span>{folder.groups?.length ?? 1} Group · {folder.conditions.length}条件 · Group間 {folder.operator.toUpperCase()}</span></div><p>{unavailable ? 'Tags OFF中はTag条件を評価しません' : `${smartResults[folder.id]?.length ?? 0}件 — 条件から自動集計`}</p><div className="mini-video-row">{smartResults[folder.id]?.slice(0, 4).map((item) => <img key={item.videoId} src={item.thumbnail} alt="" />)}</div><button className="secondary-button" disabled={unavailable} onClick={() => setSelectedSmartFolderId(folder.id)}>結果を開く</button><button className="danger-text" onClick={() => confirm('Smart Folderを削除しますか？') && app.replaceState((current) => ({ ...current, smartFolders: current.smartFolders.filter((item) => item.id !== folder.id) }))}>Delete</button></article> })}</div>
      {selectedSmartFolder && <section className="collection-results"><div className="section-heading"><div><span className="section-kicker"><Pin /></span><h2>{selectedSmartFolder.name}</h2></div><span>{selectedSmartUnavailable ? '依存Feature OFF' : `${selectedSmartVideos.length}本`}</span></div>{selectedSmartUnavailable ? <EmptyState icon={Tags} title="TagsがOFFです" description="設定は保持されています。TagsをONにするとこのSmart Folderを再評価します。" /> : selectedSmartVideos.length ? <div className="video-grid">{selectedSmartVideos.map((item) => <VideoCard video={item} key={item.videoId} />)}</div> : <EmptyState icon={Pin} title="条件に一致する動画がありません" description="Libraryデータが更新されると自動で再評価されます。" />}</section>}
    </>}
    {video && <div className="modal-backdrop" onClick={() => dismissOrganize()}><section className="modal organize-modal" role="dialog" aria-modal="true" aria-label="動画を整理" onClick={(e) => e.stopPropagation()}><button className="modal-close icon-button" onClick={() => dismissOrganize()}><X /></button><div className="modal-heading"><img src={video.thumbnail} alt="" /><div><span className="eyebrow">ORGANIZE</span><h2>{video.title}</h2></div></div><h3>Folders</h3><div className="choice-list">{app.state.folders.map((folder) => <label key={folder.id}><input type="checkbox" checked={folder.videoIds.includes(video.videoId)} onChange={() => app.toggleFolderVideo(folder.id, video.videoId)} />{folder.name}</label>)}</div><div className="inline-form"><input value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder="新しいFolder" /><button onClick={() => { app.addFolder(folderName); setFolderName('') }}>追加</button></div>{app.feature('tags') && <><h3>Tags</h3><div className="tag-cloud">{app.state.tags.filter((tag) => tag.videoIds.includes(video.videoId)).map((tag) => <button className="tag-chip" key={tag.id} onClick={() => app.removeTag(tag.id, video.videoId)}>{tag.display}<X /></button>)}</div><div className="inline-form"><input value={tagName} onChange={(e) => setTagName(e.target.value)} placeholder="Tag（32文字まで）" maxLength={32} /><button onClick={() => { app.addTag(tagName, video.videoId); setTagName('') }}>追加</button></div></>}<h3><NotebookPen />Note</h3><NoteEditor key={video.videoId} videoId={video.videoId} initialValue={app.state.notes.find((note) => note.videoId === video.videoId)?.text ?? ''} onSave={app.saveNote} placeholder="Plain text note（入力停止後に自動保存）" /></section></div>}
  </div>
}
