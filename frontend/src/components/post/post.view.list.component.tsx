import React from "react";
import { useNavigate } from "react-router-dom";
import { Post } from "../../models/post";
import LoadingAnimation from "../loading/loading.component";

interface IExploreViewListComponentProps {
  posts: Post[];
  isLoading: boolean;
}

const ExploreViewListComponent: React.FC<IExploreViewListComponentProps> = ({
  posts,
  isLoading,
}) => {
  const navigate = useNavigate();
  const getAuthorInitials = (name?: string) => {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts
      .map((part) => part.charAt(0).toUpperCase())
      .join("")
      .slice(0, 2);
  };
  const formatDate = (value?: string) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  };

  if (isLoading) {
    return <LoadingAnimation />;
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {posts.length > 0 ? (
          posts.map((story) => (
            <div
              key={story._id}
              onClick={() => navigate(`/post/${story._id}`)}
              className="cursor-pointer bg-slate-800/60 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-lg hover:shadow-2xl hover:shadow-blue-500/10 hover:-translate-y-1 transition-all duration-300 overflow-hidden group flex flex-col h-full"
            >
              <div className="relative overflow-hidden">
                <img
                  src={story.imageURL}
                  alt={`Cover image for ${story.title}`}
                  className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-500"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent opacity-60 pointer-events-none"></div>

                <span className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-md border border-slate-600 text-blue-300 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-lg">
                  {story.tag}
                </span>
              </div>

              <div className="p-6 flex-1 flex flex-col">
                <h3 className="font-bold text-lg mb-2 text-slate-100 group-hover:text-blue-400 transition-colors line-clamp-1">
                  {story.title}
                </h3>

                <p className="text-sm text-slate-400 mb-6 line-clamp-2 flex-1 leading-relaxed">
                  {story.content.slice(0, 100)}...
                </p>

                <div className="flex items-center justify-between text-sm text-slate-500 border-t border-slate-700/50 pt-4 mt-auto">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-full bg-slate-900/70 border border-slate-700 text-slate-200 flex items-center justify-center text-xs font-semibold">
                      {getAuthorInitials(story.author?.name)}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-slate-200 text-sm font-semibold leading-tight">
                        {story.author?.name || "Unknown author"}
                      </span>
                      <span className="text-slate-400 text-xs leading-tight">
                        {formatDate(story.publishedAt || story.createdAt)}
                      </span>
                      {story.author?.profile?.bio ? (
                        <span className="text-slate-400 text-xs leading-relaxed line-clamp-2 mt-1">
                          {story.author.profile.bio}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div>No posts available</div>
        )}
      </div>
    </div>
  );
};

export default ExploreViewListComponent;
