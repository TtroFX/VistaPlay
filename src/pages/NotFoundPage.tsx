import { ArrowLeft, SearchX } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
export default function NotFoundPage() { const navigate = useNavigate(); return <div className="page"><EmptyState icon={SearchX} title="Page not found" description="指定されたPageは存在しません。" action={<button className="primary-button" onClick={() => navigate('/')}><ArrowLeft />Homeへ戻る</button>} /></div> }
