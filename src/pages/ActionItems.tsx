import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Check, User, ChevronDown, ChevronRight, ExternalLink, Pencil, CheckSquare, Calendar, Video, Filter } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface ActionItemData {
  task: string;
  owner?: string;
  priority?: 'low' | 'medium' | 'high';
}

interface ActionItem {
  id: string;
  index: number;
  task: string;
  owner?: string;
  priority?: 'low' | 'medium' | 'high';
  completed: boolean;
}

interface MeetingGroup {
  id: string;
  title: string;
  date: string;
  source: string;
  actionItems: ActionItem[];
}

type FilterStatus = 'all' | 'open' | 'completed';
type SortOption = 'date' | 'priority';

const priorityOrder = { high: 0, medium: 1, low: 2, undefined: 3 };

export default function ActionItems() {
  const { user } = useAuth();
  const [meetingGroups, setMeetingGroups] = useState<MeetingGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [completedItems, setCompletedItems] = useState<Set<string>>(new Set());
  const [expandedMeetings, setExpandedMeetings] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [meetingFilter, setMeetingFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('date');

  useEffect(() => {
    if (user) fetchActionItems();
  }, [user]);

  // Auto-expand all meetings on first load
  useEffect(() => {
    if (meetingGroups.length > 0 && expandedMeetings.size === 0) {
      setExpandedMeetings(new Set(meetingGroups.map(g => g.id)));
    }
  }, [meetingGroups]);

  const fetchActionItems = async () => {
    try {
      const { data: meetings } = await supabase
        .from('meetings')
        .select(`id, title, start_time, source, meeting_insights (action_items)`)
        .eq('user_id', user?.id)
        .order('start_time', { ascending: false });

      const groups: MeetingGroup[] = [];
      
      meetings?.forEach((meeting) => {
        const insights = meeting.meeting_insights?.[0];
        if (insights?.action_items && Array.isArray(insights.action_items)) {
          const items: ActionItem[] = [];
          
          (insights.action_items as (string | ActionItemData)[]).forEach((item, index) => {
            const isObject = typeof item === 'object' && item !== null;
            items.push({
              id: `${meeting.id}-${index}`,
              index,
              task: isObject ? (item as ActionItemData).task : item as string,
              owner: isObject ? (item as ActionItemData).owner : undefined,
              priority: isObject ? (item as ActionItemData).priority : undefined,
              completed: false,
            });
          });
          
          if (items.length > 0) {
            groups.push({
              id: meeting.id,
              title: meeting.title,
              date: meeting.start_time,
              source: meeting.source || 'manual',
              actionItems: items,
            });
          }
        }
      });
      
      setMeetingGroups(groups);
    } catch (error) {
      console.error('Error fetching action items:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleComplete = (itemId: string) => {
    setCompletedItems((prev) => {
      const newSet = new Set(prev);
      const wasCompleted = newSet.has(itemId);
      
      if (wasCompleted) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
        toast.success('Task marked complete');
      }
      
      return newSet;
    });
  };

  const toggleMeetingExpanded = (meetingId: string) => {
    setExpandedMeetings((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(meetingId)) newSet.delete(meetingId);
      else newSet.add(meetingId);
      return newSet;
    });
  };

  const startEditing = (item: ActionItem) => {
    setEditingId(item.id);
    setEditText(item.task);
  };

  const saveEdit = () => {
    if (editingId) {
      // Update local state
      setMeetingGroups(prev => prev.map(group => ({
        ...group,
        actionItems: group.actionItems.map(item => 
          item.id === editingId ? { ...item, task: editText } : item
        )
      })));
      toast.success('Task updated');
      setEditingId(null);
      setEditText('');
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'google_calendar':
        return <Calendar className="w-3.5 h-3.5" />;
      case 'zoom':
        return <Video className="w-3.5 h-3.5" />;
      default:
        return null;
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'google_calendar':
        return 'Google Meet';
      case 'zoom':
        return 'Zoom';
      default:
        return 'Manual';
    }
  };

  // Filter and sort logic
  const filteredGroups = useMemo(() => {
    let groups = [...meetingGroups];
    
    // Filter by meeting
    if (meetingFilter !== 'all') {
      groups = groups.filter(g => g.id === meetingFilter);
    }
    
    // Filter items by status
    groups = groups.map(group => ({
      ...group,
      actionItems: group.actionItems.filter(item => {
        const isCompleted = completedItems.has(item.id);
        if (statusFilter === 'open') return !isCompleted;
        if (statusFilter === 'completed') return isCompleted;
        return true;
      })
    })).filter(g => g.actionItems.length > 0);
    
    // Sort
    if (sortBy === 'priority') {
      groups = groups.map(group => ({
        ...group,
        actionItems: [...group.actionItems].sort((a, b) => 
          (priorityOrder[a.priority || 'undefined'] || 3) - (priorityOrder[b.priority || 'undefined'] || 3)
        )
      }));
    }
    
    return groups;
  }, [meetingGroups, statusFilter, meetingFilter, sortBy, completedItems]);

  const totalItems = meetingGroups.reduce((acc, g) => acc + g.actionItems.length, 0);
  const openCount = totalItems - completedItems.size;
  const completedCount = completedItems.size;

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground mb-1">Action Items</h1>
          <p className="text-sm text-muted-foreground">
            Tasks extracted from your meetings · {openCount} open · {completedCount} completed
          </p>
        </div>

        {loading ? (
          <div className="space-y-6">
            {[1, 2].map((i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-6 w-64" />
                <Skeleton className="h-14 rounded-lg" />
                <Skeleton className="h-14 rounded-lg" />
              </div>
            ))}
          </div>
        ) : totalItems === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <CheckSquare className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-foreground font-medium mb-1">No action items yet</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              Action items will appear here after meetings are processed. Record a meeting to get started.
            </p>
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="flex items-center gap-3 mb-6 pb-6 border-b border-border/50">
              <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
                {(['all', 'open', 'completed'] as FilterStatus[]).map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={cn(
                      "px-3 py-1.5 text-sm font-medium rounded-md transition-colors capitalize",
                      statusFilter === status 
                        ? "bg-background text-foreground shadow-sm" 
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {status}
                  </button>
                ))}
              </div>
              
              <div className="flex items-center gap-2 ml-auto">
                <Select value={meetingFilter} onValueChange={setMeetingFilter}>
                  <SelectTrigger className="w-[180px] h-9 text-sm">
                    <Filter className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                    <SelectValue placeholder="All meetings" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All meetings</SelectItem>
                    {meetingGroups.map(g => (
                      <SelectItem key={g.id} value={g.id}>{g.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                  <SelectTrigger className="w-[140px] h-9 text-sm">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">By date</SelectItem>
                    <SelectItem value="priority">By priority</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Meeting Groups */}
            <div className="space-y-6">
              {filteredGroups.map((group) => (
                <Collapsible
                  key={group.id}
                  open={expandedMeetings.has(group.id)}
                  onOpenChange={() => toggleMeetingExpanded(group.id)}
                >
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center gap-2 py-2 group text-left">
                      {expandedMeetings.has(group.id) ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                      <span className="font-medium text-foreground group-hover:text-orange-400 transition-colors">
                        {group.title}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        · {format(new Date(group.date), 'MMM d, yyyy')}
                      </span>
                      {getSourceIcon(group.source) && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          · {getSourceIcon(group.source)} {getSourceLabel(group.source)}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {group.actionItems.filter(i => !completedItems.has(i.id)).length} open
                      </span>
                    </button>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <div className="ml-6 mt-2 space-y-1">
                      {group.actionItems.map((item) => {
                        const isCompleted = completedItems.has(item.id);
                        const isEditing = editingId === item.id;
                        
                        return (
                          <div
                            key={item.id}
                            className={cn(
                              "group flex items-start gap-3 py-3 px-3 -mx-3 rounded-lg transition-colors",
                              "hover:bg-muted/50",
                              isCompleted && "opacity-60"
                            )}
                          >
                            {/* Checkbox */}
                            <button
                              onClick={() => toggleComplete(item.id)}
                              className={cn(
                                "w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all",
                                isCompleted 
                                  ? "bg-orange-500 border-orange-500" 
                                  : "border-border hover:border-orange-400"
                              )}
                            >
                              {isCompleted && <Check className="w-3 h-3 text-white" />}
                            </button>
                            
                            {/* Task content */}
                            <div className="flex-1 min-w-0">
                              {isEditing ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    value={editText}
                                    onChange={(e) => setEditText(e.target.value)}
                                    className="h-8 text-sm"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveEdit();
                                      if (e.key === 'Escape') cancelEdit();
                                    }}
                                  />
                                  <Button size="sm" variant="ghost" onClick={saveEdit} className="h-8 px-2">
                                    Save
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-8 px-2 text-muted-foreground">
                                    Cancel
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  <p className={cn("text-foreground", isCompleted && "line-through")}>
                                    {item.task}
                                  </p>
                                  
                                  <div className="flex items-center gap-2 mt-1.5">
                                    {item.owner && (
                                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                        <User className="w-3 h-3" />{item.owner}
                                      </span>
                                    )}
                                    {item.priority && (
                                      <span className={cn(
                                        "text-xs px-1.5 py-0.5 rounded font-medium",
                                        item.priority === 'high' && "bg-destructive/10 text-destructive",
                                        item.priority === 'medium' && "bg-warning/10 text-warning",
                                        item.priority === 'low' && "bg-muted text-muted-foreground"
                                      )}>
                                        {item.priority}
                                      </span>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                            
                            {/* Hover actions */}
                            {!isEditing && (
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => startEditing(item)}
                                  className="h-7 w-7 p-0"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Link to={`/meeting/${group.id}`}>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </Button>
                                </Link>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
              
              {filteredGroups.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  No action items match your filters.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
