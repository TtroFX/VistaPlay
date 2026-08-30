import { Archive, Bot, Captions, ChevronDown, ChevronRight, Clock3, FileText, GitCompareArrows, Heart, Inbox, ListVideo, MessageCircle, NotebookPen, Plus, SkipForward, Sparkles, Tags, UserRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchComments, extractChapters, extractTimestamps, verifyVideoIds, type YouTubeCommentsResponse } from '../lib/youtube'
import { fetchSponsorSegments, type SponsorSegment } from '../lib/sponsorBlock'
import { formatDuration } from '../lib/time'
import { playerEngine } from '../player/PlayerEngine'
import { useApp } from '../store/AppStore'

type WatchTab = 'queue' | 'chapters' | 'comments' | 'captions' | 'livechat' | 'overview'
interface CommentView { id: string; author: string; text: string; likes: number; replies: CommentView[] }

function mapComments(data: YouTubeCommentsResponse): CommentView[] {
  return (data.items ?? []).map((item) => {
    const top = item.snippet?.topLevelComment
    return { id: top?.id ?? item.id ?? crypto.randomUUID(), author: top?.snippet?.authorDisplayName ?? 'Unknown', text: top?.snippet?.textDisplay ?? '', likes: top?.snippet?.likeCount ?? 0, replies: (item.replies?.comments ?? []).map((reply) => ({ id: reply.id ?? crypto.randomUUID(), author: reply.snippet?.authorDisplayName ?? 'Unknown', text: reply.snippet?.textDisplay ?? '', likes: reply.snippet?.likeCount ?? 0, replies: [] })) }
  })
}

export default function WatchPage() {
  const app = useApp(); const navigate = useNavigate(); const [params] = useSearchParams(); const videoId = params.get('v')
  const [tab, setTab] = useState<WatchTab>(app.state.settings.layout.defaultWatchTab as WatchTab)
  const [comments, setComments] = useState<CommentView[]>([]); const [commentNext, setCommentNext] = useState<string>(); const [commentLoading, setCommentLoading] = useState(false); const [commentError, setCommentError] = useState(''); const [commentKeyword, setCommentKeyword] = useState(''); const [commentUsername, setCommentUsername] = useState(''); const [commentHasTimestamp, setCommentHasTimestamp] = useState(false); const [commentHasReplies, setCommentHasReplies] = useState(false); const [commentOrder, setCommentOrder] = useState<'relevance' | 'time'>('relevance')
  const [sponsors, setSponsors] = useState<SponsorSegment[]>([]); const [descriptionOpen, setDescriptionOpen] = useState(false)
  const video = videoId ? app.state.videos[videoId] ?? (app.currentVideo?.videoId === videoId ? app.currentVideo : undefined) : undefined
  const chapters = useMemo(() => extractChapters(video?.description ?? '', video?.durationSeconds), [video?.description, video?.durationSeconds])
  const focusMode = app.state.settings.layout.focusMode
  const cinemaMode = app.state.settings.layout.cinemaMode
  const allTabs = ([['queue', 'Queue', ListVideo], ...(app.feature('chapters') ? [['chapters', 'Chapters', FileText]] : []), ...(app.feature('comments') ? [['comments', 'Comments', MessageCircle]] : []), ...(app.feature('captions') ? [['captions', 'Captions', Captions]] : []), ...(app.feature('liveChat') && video?.liveStatus === 'live' ? [['livechat', 'Live Chat', MessageCircle]] : []), ['overview', 'Overview', Sparkles]] as Array<[WatchTab, string, typeof ListVideo]>)
  const tabs = focusMode ? allTabs.filter(([key]) => key === 'chapters' || key === 'captions') : allTabs
  const paneVisible = !cinemaMode && tabs.length > 0
  const availableTabKeys = tabs.map(([key]) => key).join(',')

  useEffect(() => {
    if (!videoId || videoId.length !== 11) return
    const fallback = app.state.videos[videoId] ?? { videoId, title: `Video ${videoId}`, thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, available: true as const }
    if (app.currentVideo?.videoId !== videoId) app.playVideo(fallback)
    const controller = new AbortController()
    verifyVideoIds([videoId], controller.signal).then(({ valid, invalid }) => {
      if (valid[0]) { app.upsertVideos(valid); app.playVideo(valid[0], app.state.history[videoId]?.position) }
      else if (invalid.includes(videoId)) app.upsertVideos([{ ...fallback, available: false, unavailableReason: 'unknown' }])
    }).catch(() => { /* direct embed remains the safe fallback */ })
    return () => controller.abort()
  }, [videoId])

  useEffect(() => {
    if (!videoId || !app.feature('sponsorSegments') || focusMode) { setSponsors([]); return }
    const controller = new AbortController(); fetchSponsorSegments(videoId, controller.signal).then(setSponsors).catch(() => setSponsors([])); return () => controller.abort()
  }, [app.feature, focusMode, videoId])

  useEffect(() => { if (!focusMode && !cinemaMode && app.feature('comments') && tab === 'comments' && !comments.length) void loadComments(false) }, [tab, commentOrder, app.feature, focusMode, cinemaMode])
  useEffect(() => { if (tabs.length && !tabs.some(([key]) => key === tab)) setTab(tabs[0][0]) }, [availableTabKeys, tab])

  async function loadComments(append: boolean) {
    if (!app.feature('comments') || !videoId || commentLoading || comments.length >= 200) return
    setCommentLoading(true); setCommentError('')
    try { const data = await fetchComments(videoId, append ? commentNext : undefined, commentOrder); const mapped = mapComments(data); setComments((items) => append ? [...items, ...mapped].slice(0, 200) : mapped); setCommentNext(data.nextPageToken) }
    catch (error) { setCommentError(error instanceof Error ? error.message : 'Comments unavailable') }
    finally { setCommentLoading(false) }
  }

  if (!videoId || videoId.length !== 11) return <div className="page"><div className="capability-notice"><strong>正しいVideo IDが必要です</strong></div></div>
  const shown = video ?? { videoId, title: `Video ${videoId}` }
  const filteredComments = comments.filter((comment) => {
    const keywordMatches = !commentKeyword.trim() || comment.text.toLowerCase().includes(commentKeyword.trim().toLowerCase())
    const usernameMatches = !commentUsername.trim() || comment.author.toLowerCase().includes(commentUsername.trim().toLowerCase())
    const timestampMatches = !commentHasTimestamp || extractTimestamps(comment.text, shown.durationSeconds).length > 0
    const repliesMatch = !commentHasReplies || comment.replies.length > 0
    return keywordMatches && usernameMatches && timestampMatches && repliesMatch
  })
  return <div className={`watch-page ${cinemaMode ? 'cinema' : ''} ${focusMode ? 'focus' : ''}`}>
    <div className="watch-content-grid">
      <section className="watch-primary">
        <div className="video-information"><h1>{shown.title}</h1>{!focusMode && <div className="video-byline">{shown.channelId ? <button onClick={() => navigate(`/channel/${shown.channelId}`)}><UserRound />{shown.channelTitle ?? 'Channel'}<ChevronRight /></button> : <span>{shown.channelTitle ?? 'Channel metadata pending'}</span>}<span>{shown.viewCount !== undefined ? `${Intl.NumberFormat('ja', { notation: 'compact' }).format(shown.viewCount)} views` : ''}</span><span>{shown.publishedAt ? new Date(shown.publishedAt).toLocaleDateString('ja-JP') : ''}</span></div>}
          {!focusMode && <>
          <div className="watch-actions"><button className={app.state.favorites.includes(videoId) ? 'active' : ''} onClick={() => app.toggleFavorite(shown)}><Heart fill={app.state.favorites.includes(videoId) ? 'currentColor' : 'none'} />お気に入り</button><button onClick={() => app.addQueue(shown)}><Plus />Queue</button><button className={app.state.watchLater.includes(videoId) ? 'active' : ''} onClick={() => app.toggleWatchLater(shown)}><Clock3 />後で見る</button>{app.feature('watchInbox') && <button onClick={() => app.toggleInbox(shown)}><Inbox />Inbox</button>}<button onClick={() => navigate(`/library?organize=${videoId}`)}><Tags />整理</button>{app.feature('compare') && <button onClick={() => navigate(`/compare?a=${videoId}`)}><GitCompareArrows />比較</button>}{app.feature('chatgpt') && <button className="ai-subtle" onClick={() => navigate(`/ai?video=${videoId}`)}><Bot />AIに関連動画を聞く</button>}<button onClick={() => app.archiveVideo(videoId)}><Archive />Archive</button></div>
          <div className="rate-memory"><span>Speed memory</span><button onClick={() => app.setVideoRate(videoId, app.player.rate)}>この動画を{app.player.rate}xに固定</button>{app.state.videoPreferences.some((item) => item.videoId === videoId) && <button onClick={() => app.setVideoRate(videoId)}>動画固有設定を解除</button>}</div>
          </>}
        </div>
        {!focusMode && sponsors.length > 0 && <div className="sponsor-actions"><span><SkipForward />SponsorBlock（自動Skip OFF）</span>{sponsors.map((segment, index) => <button key={`${segment.segment[0]}-${index}`} onClick={() => playerEngine.seekTo(segment.segment[1])}>{segment.category} {formatDuration(segment.segment[0])} → Skip</button>)}</div>}
        {!focusMode && shown.description && <div className={`description-panel ${descriptionOpen ? 'open' : ''}`}><p>{shown.description}</p><button onClick={() => setDescriptionOpen((value) => !value)}>{descriptionOpen ? '閉じる' : 'もっと見る'}<ChevronDown /></button></div>}
      </section>
      {paneVisible && <aside className="watch-pane" style={{ width: app.state.settings.layout.rightPaneWidth }}><div className="pane-tabs" role="tablist">{tabs.map(([key, label, Icon]) => <button role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)} key={key}><Icon />{label}</button>)}</div><div className="pane-content">
        {tab === 'queue' && <div className="pane-queue">{app.state.queue.length ? app.state.queue.map((item, index) => <button key={item.id} onClick={() => { app.playQueueItem(item.id); navigate(`/watch?v=${item.video.videoId}`) }}><span>{index + 1}</span><img src={item.video.thumbnail} alt="" /><strong>{item.video.title}</strong></button>) : <p className="pane-empty">Queueは空です</p>}</div>}
        {tab === 'chapters' && (chapters.length ? <div className="chapter-list">{chapters.map((chapter) => <button key={chapter.start} onClick={() => playerEngine.seekTo(chapter.start)}><span>{formatDuration(chapter.start)}</span><strong>{chapter.title}</strong></button>)}</div> : <p className="pane-empty">DescriptionからChapterを検出できませんでした。</p>)}
        {tab === 'captions' && <div className="capability-copy"><Captions /><h3>YouTube標準Caption</h3><p>字幕はPlayer内の正式Caption操作から利用できます。iframe字幕のscrapingは行いません。</p></div>}
        {tab === 'livechat' && <iframe className="live-chat-frame" title="YouTube Live Chat" src={`https://www.youtube.com/live_chat?v=${videoId}&embed_domain=${window.location.hostname}`} />}
        {tab === 'overview' && <div className="overview-list"><div><span>Duration</span><strong>{formatDuration(shown.durationSeconds)}</strong></div><div><span>Category</span><strong>{shown.categoryId ?? 'Unavailable'}</strong></div><div><span>Watch state</span><strong>{app.state.history[videoId]?.state ?? 'UNWATCHED'}</strong></div>{shown.tags?.slice(0, 12).map((tag) => <span className="tag-chip" key={tag}>{tag}</span>)}</div>}
        {tab === 'comments' && <div className="comments-panel"><div className="comment-toolbar"><input value={commentKeyword} onChange={(e) => setCommentKeyword(e.target.value)} placeholder="Keyword" aria-label="Comment keyword" /><input value={commentUsername} onChange={(e) => setCommentUsername(e.target.value)} placeholder="Username" aria-label="Comment username" /><select value={commentOrder} onChange={(e) => { setCommentOrder(e.target.value as 'relevance' | 'time'); setComments([]); setCommentNext(undefined) }}><option value="relevance">Relevance</option><option value="time">Newest</option></select><label className="check-label compact-check"><input type="checkbox" checked={commentHasTimestamp} onChange={(e) => setCommentHasTimestamp(e.target.checked)} />Timestampあり</label><label className="check-label compact-check"><input type="checkbox" checked={commentHasReplies} onChange={(e) => setCommentHasReplies(e.target.checked)} />Replyあり</label></div>{commentError && <p className="error-copy">{commentError}</p>}{!commentLoading && !filteredComments.length && <p className="pane-empty">取得済みCommentに一致する結果はありません。</p>}{filteredComments.map((comment) => <CommentItem comment={comment} duration={shown.durationSeconds} key={comment.id} />)}{commentNext && comments.length < 200 && <button className="load-comments" disabled={commentLoading} onClick={() => void loadComments(true)}>{commentLoading ? '読み込み中…' : 'さらに20件取得'}</button>}</div>}
      </div></aside>}
    </div>
    {!focusMode && <section className="notes-inline"><NotebookPen /><div><strong>Note</strong><span>Plain text / 最大20,000文字 / focusを外すと保存</span></div><textarea maxLength={20000} defaultValue={app.state.notes.find((note) => note.videoId === videoId)?.text ?? ''} onBlur={(e) => app.saveNote(videoId, e.target.value)} /></section>}
  </div>
}

function CommentItem({ comment, duration }: { comment: CommentView; duration?: number }) {
  const [open, setOpen] = useState(false)
  const timestamps = extractTimestamps(comment.text, duration)
  const rendered = timestamps.length ? <>{comment.text}<div className="timestamp-row">{timestamps.map((value) => <button key={value} onClick={() => playerEngine.seekTo(value)}>{formatDuration(value)}</button>)}</div></> : comment.text
  return <article className="comment"><div className="comment-avatar">{comment.author.slice(0, 1).toUpperCase()}</div><div><strong>{comment.author}</strong><p>{rendered}</p><span>{comment.likes} likes</span>{comment.replies.length > 0 && <button className="reply-toggle" onClick={() => setOpen((value) => !value)}>{open ? 'Repliesを閉じる' : `${comment.replies.length}件のReply`}</button>}{open && <div className="replies">{comment.replies.map((reply) => <CommentItem comment={reply} duration={duration} key={reply.id} />)}</div>}</div></article>
}
