/**
 * ConversationListItem Component
 * Sprint 5: Individual conversation item for history sidebar
 * Displays title, message count, time, and actions (favorite, delete)
 */

"use client";

import React, { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { Star, Trash2, MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ConversationMetadata } from "@/types/coach-history";

interface ConversationListItemProps {
  conversation: ConversationMetadata;
  isActive?: boolean;
  onLoad: (conversationId: string) => void;
  onToggleFavorite: (conversationId: string) => void;
  onDelete: (conversationId: string) => void;
}

export function ConversationListItem({
  conversation,
  isActive = false,
  onLoad,
  onToggleFavorite,
  onDelete,
}: ConversationListItemProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const t = useTranslations("coach.conversations");

  const handleDelete = () => {
    onDelete(conversation.id);
    setShowDeleteDialog(false);
  };

  return (
    <>
      <div
        className={`
          group relative p-4 rounded-2xl border-2 cursor-pointer transition-all duration-200
          ${
            isActive
              ? "border-huntzen-blue bg-huntzen-blue/5 shadow-sm"
              : "border-gray-200 hover:border-huntzen-blue hover:bg-huntzen-blue/5"
          }
        `}
        onClick={() => onLoad(conversation.id)}
      >
        {/* Title and Favorite */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 flex-1">
            {conversation.title}
          </h3>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(conversation.id);
            }}
            className="flex-shrink-0 p-1 rounded hover:bg-gray-100 transition-colors"
            aria-label={
              conversation.is_favorite ? t("removeFavorite") : t("addFavorite")
            }
          >
            <Star
              className={`w-4 h-4 transition-colors ${
                conversation.is_favorite
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-gray-400 hover:text-yellow-400"
              }`}
            />
          </button>
        </div>

        {/* Preview */}
        {conversation.preview && (
          <p className="text-xs text-gray-600 line-clamp-2 mb-3">
            {conversation.preview}
          </p>
        )}

        {/* Metadata and Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              {conversation.message_count}
            </span>
            <span
              title={new Date(conversation.last_message_at).toLocaleString(
                "fr-FR",
              )}
            >
              {formatDistanceToNow(new Date(conversation.last_message_at), {
                addSuffix: true,
                locale: fr,
              })}
            </span>
          </div>

          {/* Delete button (visible on hover) */}
          <Button
            variant="ghost"
            size="sm"
            className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0 hover:bg-red-50 hover:text-red-600"
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteDialog(true);
            }}
            aria-label={t("deleteConversation")}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDescription", { title: conversation.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
