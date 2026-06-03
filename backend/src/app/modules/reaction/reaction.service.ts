import ApiError from "../../../errors/api_error";
import { ITokenPayload } from "../../../interfaces/token";
import { User } from "../user/user.model";
import httpStatus from "http-status";
import { Reaction } from "./reaction.model";
import { Types } from "mongoose";
import { Post } from "../post/post.model";

type ReactionType = "like" | "love" | "laugh" | "angry" | "sad";

const toggleReaction = async (
  postId: string,
  type: ReactionType = "like",
  token: ITokenPayload
) => {
  const { email } = token;

  const user = await User.findOne({ email }).select("_id").lean();

  if (!user) {
    throw new ApiError(httpStatus.BAD_REQUEST, "User not found!");
  }

  const post = await Post.findOne({
    _id: postId,
    isDeleted: { $ne: true },
  }).select("likesCount reactions");

  if (!post) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Post not found!");
  }

  const existingReaction = await Reaction.findOne({
    postId: new Types.ObjectId(postId),
    userId: user._id,
  });

  const currentReactions = post.reactions || [];

  if (existingReaction) {
    post.likesCount = Math.max(0, (post.likesCount || 0) - 1);
    await post.updateOne({ $pull: { reactions: existingReaction._id } });
    await Reaction.deleteOne({ _id: existingReaction._id });

    return {
      message: "Reaction removed",
      likesCount: post.likesCount,
    };
  } else {
    const newReaction = await Reaction.create({
      postId: new Types.ObjectId(postId),
      userId: user._id,
      type: type,
    });

    post.likesCount = (post.likesCount || 0) + 1;
    currentReactions.push(newReaction._id as Types.ObjectId);
    post.reactions = currentReactions;
    await post.save();

    return {
      message: "Reaction added",
      likesCount: post.likesCount,
    };
  }
};

export const ReactionService = {
  toggleReaction,
};
