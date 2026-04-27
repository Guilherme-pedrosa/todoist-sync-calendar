import { useParams } from 'react-router-dom';
import { TaskList } from '@/components/TaskList';

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  return <TaskList view="project" projectId={projectId} />;
}
