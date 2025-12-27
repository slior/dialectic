'use client'

import { useState, useRef, useEffect, useCallback } from 'react';
import { useDebateSocket } from '@/hooks/useDebateSocket';
import { DEBATE_STATUS } from '@/lib/types';
import StatusBar from './StatusBar';
import NotificationArea from './NotificationArea';
import ProblemInput from './ProblemInput';
import DebateConfigurationPanel from './DebateConfigurationPanel';
import ClarificationsPanel from './ClarificationsPanel';
import AgentCard from './AgentCard';
import SolutionPanel from './SolutionPanel';

const MIN_LEFT_PANEL_WIDTH_PX = 200;
const MIN_RIGHT_PANEL_WIDTH_PX = 300;
const MIN_SOLUTION_PANEL_HEIGHT_PX = 100;
const MIN_AGENTS_GRID_HEIGHT_PX = 200;

export default function Dashboard() {
  const {
    state,
    setProblem,
    setRounds,
    toggleClarifications,
    startDebate,
    submitClarifications,
    cancelDebate,
    clearNotification,
    setAgentConfigs,
  } = useDebateSocket();

  // Panel size state
  const [leftPanelWidth, setLeftPanelWidth] = useState<string>('33.33%');
  const [solutionPanelHeight, setSolutionPanelHeight] = useState<string>('256px');

  // Drag state refs
  const isDraggingVertical = useRef(false);
  const isDraggingHorizontal = useRef(false);
  const dragStartX = useRef(0);
  const dragStartY = useRef(0);
  const startLeftWidth = useRef(0);
  const startSolutionHeight = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const canStartDebate = !state.isRunning && state.problem.trim().length > 0 && state.agentConfigs.length > 0;
  const showClarifications = state.status === DEBATE_STATUS.AWAITING_CLARIFICATIONS && state.clarificationQuestions;

  // Convert percentage or pixel string to pixels
  const parseWidth = useCallback((width: string, containerWidth: number): number => {
    if (width.endsWith('%')) {
      return (parseFloat(width) / 100) * containerWidth;
    }
    return parseFloat(width);
  }, []);

  // Convert pixel string to pixels
  const parseHeight = useCallback((height: string): number => {
    return parseFloat(height);
  }, []);

  // Vertical resize handlers
  const handleVerticalResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingVertical.current = true;
    dragStartX.current = e.clientX;
    
    if (containerRef.current) {
      const containerWidth = containerRef.current.offsetWidth;
      startLeftWidth.current = parseWidth(leftPanelWidth, containerWidth);
    }
    
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  }, [leftPanelWidth, parseWidth]);

  const handleVerticalResizeMove = useCallback((e: MouseEvent) => {
    if (!isDraggingVertical.current || !containerRef.current) return;

    const containerWidth = containerRef.current.offsetWidth;
    const deltaX = e.clientX - dragStartX.current;
    const newWidthPx = startLeftWidth.current + deltaX;
    
    // Enforce minimums
    const minWidthPx = MIN_LEFT_PANEL_WIDTH_PX;
    const maxWidthPx = containerWidth - MIN_RIGHT_PANEL_WIDTH_PX;
    
    const clampedWidthPx = Math.max(minWidthPx, Math.min(newWidthPx, maxWidthPx));
    const newWidthPercent = (clampedWidthPx / containerWidth) * 100;
    
    setLeftPanelWidth(`${newWidthPercent}%`);
  }, []);

  const handleVerticalResizeEnd = useCallback(() => {
    isDraggingVertical.current = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }, []);

  // Horizontal resize handlers
  const handleHorizontalResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingHorizontal.current = true;
    dragStartY.current = e.clientY;
    startSolutionHeight.current = parseHeight(solutionPanelHeight);
    
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';
  }, [solutionPanelHeight, parseHeight]);

  const handleHorizontalResizeMove = useCallback((e: MouseEvent) => {
    if (!isDraggingHorizontal.current || !containerRef.current) return;

    const containerHeight = containerRef.current.offsetHeight;
    const deltaY = dragStartY.current - e.clientY; // Inverted: dragging up increases height
    const newHeightPx = startSolutionHeight.current + deltaY;
    
    // Enforce minimums
    const maxHeightPx = containerHeight - MIN_AGENTS_GRID_HEIGHT_PX;
    const clampedHeightPx = Math.max(MIN_SOLUTION_PANEL_HEIGHT_PX, Math.min(newHeightPx, maxHeightPx));
    
    setSolutionPanelHeight(`${clampedHeightPx}px`);
  }, [parseHeight]);

  const handleHorizontalResizeEnd = useCallback(() => {
    isDraggingHorizontal.current = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }, []);

  // Global mouse event handlers for dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingVertical.current) {
        handleVerticalResizeMove(e);
      } else if (isDraggingHorizontal.current) {
        handleHorizontalResizeMove(e);
      }
    };

    const handleMouseUp = () => {
      if (isDraggingVertical.current) {
        handleVerticalResizeEnd();
      } else if (isDraggingHorizontal.current) {
        handleHorizontalResizeEnd();
      }
    };

    // Always attach listeners - they check refs internally
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleVerticalResizeMove, handleVerticalResizeEnd, handleHorizontalResizeMove, handleHorizontalResizeEnd]);

  return (
    <div className="h-screen flex flex-col bg-primary">
      {/* Top: Status Bar */}
      <StatusBar
        status={state.status}
        round={state.currentRound}
        totalRounds={state.totalRounds}
        phase={state.currentPhase}
      />

      {/* Main Content */}
      <div ref={containerRef} className="flex-1 flex min-h-0">
        {/* Left Panel: Problem Input + Clarifications + Controls */}
        <div 
          className="flex-shrink-0 border-r border-border flex flex-col"
          style={{ width: leftPanelWidth }}
        >
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <ProblemInput
              value={state.problem}
              onChange={setProblem}
              disabled={state.isRunning}
            />

            <DebateConfigurationPanel
              rounds={state.rounds}
              agents={state.agentConfigs}
              onRoundsChange={setRounds}
              onAgentsChange={setAgentConfigs}
              disabled={state.isRunning}
              isCollapsed={state.configPanelCollapsed}
            />

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={state.clarificationsEnabled}
                  onChange={toggleClarifications}
                  disabled={state.isRunning}
                  className="w-4 h-4 rounded border-border bg-tertiary checked:bg-accent-cyan"
                />
                Enable Clarifications
              </label>
            </div>

            {showClarifications && state.clarificationQuestions && (
              <ClarificationsPanel
                questions={state.clarificationQuestions}
                onSubmit={submitClarifications}
              />
            )}
          </div>

          {/* Control Buttons */}
          <div className="p-4 border-t border-border flex gap-3">
            <button
              onClick={() => startDebate(state.problem)}
              disabled={!canStartDebate}
              className={`flex-1 py-2 px-4 rounded font-medium transition-colors ${
                canStartDebate
                  ? 'bg-accent-green text-primary hover:bg-accent-green/80'
                  : 'bg-tertiary text-text-muted cursor-not-allowed'
              }`}
            >
              {state.isRunning ? 'Debate in Progress...' : 'Start Debate'}
            </button>
            {state.isRunning && (
              <button
                onClick={cancelDebate}
                className="py-2 px-4 rounded font-medium bg-accent-red text-primary hover:bg-accent-red/80 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Vertical Resize Handle */}
        <div
          onMouseDown={handleVerticalResizeStart}
          className="w-1 bg-transparent hover:bg-border cursor-col-resize transition-colors flex-shrink-0"
          style={{ minWidth: '4px' }}
        />

        {/* Right Panel: Agents Grid */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {/* Agents Grid */}
          <div className="flex-1 min-h-0 p-4 overflow-y-auto">
            <div className="grid grid-cols-3 gap-3 h-full">
              {state.agents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} isDebateCompleted={state.status === DEBATE_STATUS.COMPLETED} />
              ))}
              {state.agents.length === 0 && (
                <div className="col-span-3 flex items-center justify-center text-text-muted">
                  <span>Connect to server to see agents</span>
                </div>
              )}
            </div>
          </div>

          {/* Horizontal Resize Handle */}
          <div
            onMouseDown={handleHorizontalResizeStart}
            className="h-1 bg-transparent hover:bg-border cursor-row-resize transition-colors flex-shrink-0"
            style={{ minHeight: '4px' }}
          />

          {/* Solution Panel */}
          <div 
            className="flex-shrink-0 border-t border-border overflow-y-auto"
            style={{ height: solutionPanelHeight }}
          >
            <SolutionPanel solution={state.solution} />
          </div>
        </div>
      </div>

      {/* Notifications */}
      <NotificationArea
        notifications={state.notifications}
        onDismiss={clearNotification}
      />
    </div>
  );
}

