import React, { memo, useState, useRef, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";

interface AgentNodeData {
	title: string;
	status: "idle" | "running" | "completed" | "error" | "awaiting_user";
	isSelected: boolean;
	isRoot?: boolean;
	context?: string;
	submittedContexts?: string[];
	content?: string;
	userPrompt?: string;
	isFinalAnswer?: boolean;
	onContextChange?: (context: string) => void;
	onContextSubmit?: (context: string) => void;
	onDelete?: () => void;
	onUserResponse?: (response: string) => void;
	onViewClick?: () => void;
}

const statusColors = {
	idle: "#d1d5db",
	running: "#3b82f6",
	completed: "#10b981",
	error: "#ef4444",
	awaiting_user: "#f59e0b",
};

export const AgentNode = memo(({ data }: { data: AgentNodeData }) => {
	const [context, setContext] = useState(data.context || "");
	const [userResponse, setUserResponse] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const responseRef = useRef<HTMLInputElement>(null);

	// Keep local state in sync with prop changes
	useEffect(() => {
		setContext(data.context || "");
	}, [data.context]);

	const handleContextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setContext(e.target.value);
		// Don't call onContextChange on every keystroke to prevent re-renders
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			submitContext();
			setContext(""); // Clear immediately
			inputRef.current?.blur();
		}
	};

	const handleUserResponseKeyDown = (
		e: React.KeyboardEvent<HTMLInputElement>
	) => {
		if (e.key === "Enter") {
			e.preventDefault();
			submitUserResponse();
		}
	};

	const submitContext = () => {
		if (context.trim()) {
			// Only submit if not empty
			if (data.onContextSubmit) {
				data.onContextSubmit(context);
			} else if (data.onContextChange) {
				data.onContextChange(context);
			}
		}
	};

	const submitUserResponse = () => {
		if (data.onUserResponse) {
			data.onUserResponse(userResponse.trim());
			setUserResponse("");
			responseRef.current?.blur();
		}
	};

	const skipUserResponse = () => {
		if (data.onUserResponse) {
			data.onUserResponse(""); // Send empty response
			setUserResponse("");
		}
	};

	const handleSubmitClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		submitContext();
		setContext(""); // Clear immediately
	};

	const handleViewClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (data.onViewClick) {
			data.onViewClick();
		}
	};

	const handleDelete = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (data.onDelete) {
			data.onDelete();
		}
	};

	// Determine border style for final answer
	const nodeStatus = data.status as keyof typeof statusColors;
	const statusColor = statusColors[nodeStatus] || statusColors.idle;
	const borderStyle = data.isFinalAnswer
		? `4px solid ${statusColor}`
		: `2px solid ${statusColor}`;

	return React.createElement(
		"div",
		{
			style: {
				position: "relative",
				padding: "16px",
				borderRadius: "12px",
				border: borderStyle,
				background: data.isFinalAnswer ? "#f0fdf4" : "white",
				minWidth: "256px",
				maxWidth: "400px",
				minHeight: "170px",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				boxShadow: data.isFinalAnswer
					? "0 8px 16px -2px rgb(16 185 129 / 0.3)"
					: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
				cursor: "pointer",
			},
		},
		!data.isRoot &&
			React.createElement(Handle, {
				type: "target",
				position: Position.Top,
				style: { background: "#999" },
			}),

		// Final answer badge
		data.isFinalAnswer &&
			React.createElement(
				"div",
				{
					style: {
						position: "absolute",
						top: "8px",
						right: "8px",
						background: "#10b981",
						color: "white",
						padding: "4px 8px",
						borderRadius: "6px",
						fontSize: "12px",
						fontWeight: 600,
					},
				},
				"✓ FINAL ANSWER"
			),

		// Controls at the top when selected
		data.isSelected &&
			React.createElement(
				"div",
				{
					style: {
						position: "absolute",
						top: "-45px",
						left: "0",
						right: "0",
						display: "flex",
						gap: "8px",
						alignItems: "center",
						background: "white",
						padding: "8px",
						borderRadius: "8px",
						boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
						zIndex: 1000,
					},
					onClick: (e: React.MouseEvent) => e.stopPropagation(),
				},
				React.createElement("input", {
					ref: inputRef,
					type: "text",
					placeholder: "Add context...",
					value: context,
					onChange: handleContextChange,
					onKeyDown: handleKeyDown,
					style: {
						flex: 1,
						padding: "6px 10px",
						border: "1px solid #d1d5db",
						borderRadius: "6px",
						fontSize: "14px",
						outline: "none",
					},
				}),
				React.createElement(
					"button",
					{
						onClick: handleSubmitClick,
						style: {
							padding: "6px 10px",
							background: "#10b981",
							color: "white",
							border: "none",
							borderRadius: "6px",
							cursor: "pointer",
							fontSize: "14px",
							fontWeight: 500,
						},
					},
					"✓"
				),
				React.createElement(
					"button",
					{
						onClick: handleViewClick,
						style: {
							padding: "6px 10px",
							background: "#3b82f6",
							color: "white",
							border: "none",
							borderRadius: "6px",
							cursor: "pointer",
							fontSize: "14px",
							fontWeight: 500,
						},
					},
					"👁️"
				),
				React.createElement(
					"button",
					{
						onClick: handleDelete,
						style: {
							padding: "6px 10px",
							background: "#ef4444",
							color: "white",
							border: "none",
							borderRadius: "6px",
							cursor: "pointer",
							fontSize: "14px",
							fontWeight: 500,
						},
					},
					"🗑️"
				)
			),

		React.createElement(
			"p",
			{
				style: {
					fontWeight: 600,
					color: "black",
					marginBottom: "8px",
					textAlign: "center",
				},
			},
			data.title
		),

		React.createElement(
			"p",
			{
				style: {
					fontSize: "14px",
					color: "#6b7280",
					textTransform: "uppercase",
					fontWeight: 500,
				},
			},
			data.status
		),

		// Display content if available
		data.content &&
			React.createElement(
				"div",
				{
					style: {
						fontSize: "13px",
						color: "#374151",
						marginTop: "12px",
						padding: "8px",
						background: "#f9fafb",
						borderRadius: "6px",
						maxHeight: "120px",
						overflow: "auto",
						width: "100%",
						whiteSpace: "pre-wrap",
					},
				},
				data.content
			),

		// User prompt input (when awaiting_user)
		data.status === "awaiting_user" &&
			data.userPrompt &&
			React.createElement(
				"div",
				{
					style: {
						marginTop: "12px",
						width: "100%",
						padding: "8px",
						background: "#fef3c7",
						borderRadius: "6px",
						border: "1px solid #f59e0b",
					},
				},
				React.createElement(
					"p",
					{
						style: {
							fontSize: "12px",
							color: "#92400e",
							marginBottom: "8px",
							fontWeight: 500,
						},
					},
					data.userPrompt
				),
				React.createElement(
					"div",
					{
						style: {
							display: "flex",
							gap: "4px",
						},
					},
					React.createElement("input", {
						ref: responseRef,
						type: "text",
						placeholder: "Your response...",
						value: userResponse,
						onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
							setUserResponse(e.target.value),
						onKeyDown: handleUserResponseKeyDown,
						onClick: (e: React.MouseEvent) => e.stopPropagation(),
						style: {
							flex: 1,
							padding: "6px 10px",
							border: "1px solid #d97706",
							borderRadius: "6px",
							fontSize: "13px",
							outline: "none",
						},
					}),
					React.createElement(
						"button",
						{
							onClick: (e: React.MouseEvent) => {
								e.stopPropagation();
								submitUserResponse();
							},
							disabled: !userResponse.trim(),
							style: {
								padding: "6px 12px",
								background: userResponse.trim() ? "#f59e0b" : "#d1d5db",
								color: "white",
								border: "none",
								borderRadius: "6px",
								cursor: userResponse.trim() ? "pointer" : "not-allowed",
								fontSize: "13px",
								fontWeight: 500,
							},
						},
						"Send"
					),
					React.createElement(
						"button",
						{
							onClick: (e: React.MouseEvent) => {
								e.stopPropagation();
								skipUserResponse();
							},
							style: {
								padding: "6px 12px",
								background: "#6b7280",
								color: "white",
								border: "none",
								borderRadius: "6px",
								cursor: "pointer",
								fontSize: "13px",
								fontWeight: 500,
							},
							title: "Skip this question",
						},
						"✕"
					)
				)
			),

		// Display only the latest submitted context
		data.submittedContexts &&
			data.submittedContexts.length > 0 &&
			React.createElement(
				"p",
				{
					style: {
						fontSize: "12px",
						color: "#3b82f6",
						marginTop: "8px",
						padding: "4px 8px",
						background: "#eff6ff",
						borderRadius: "4px",
						fontWeight: 500,
						width: "100%",
						textAlign: "center",
					},
				},
				`Context: ${data.submittedContexts[data.submittedContexts.length - 1]}`
			),

		React.createElement(Handle, {
			type: "source",
			position: Position.Bottom,
			style: { background: "#999" },
		})
	);
});

AgentNode.displayName = "AgentNode";
