import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const loggedUser = await User.findById(userId);
    const accessToken = loggedUser.generateAccessToken();
    const refreshToken = loggedUser.generateRefreshToken();

    loggedUser.refreshToken = refreshToken;
    await loggedUser.save({ validateBeforeSave: "false" });
    return { accessToken, refreshToken, loggedUser };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating refresh and access tokens"
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  //1. get user details from frontend
  //2. validation - not empty
  //3. check if user already exists : username,email
  //4. check for images,check for avatar
  //5. upload them to cloudinary,avatar
  //6. create user object - create entry in db
  //7. remove password and refresh token field from response
  //8. check for user creation
  //9. return response

  //1
  const { fullName, username, email, password } = req.body;

  //2
  if (
    [fullName, email, username, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "All fields are required required");
  }

  //3
  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });
  if (existedUser) {
    throw new ApiError(409, "User with email or username already exists");
  }

  //4
  const avatarLocalPath = await req?.files?.avatar?.[0]?.path;
  const coverImageLocalPath = await req?.files?.coverImage?.[0]?.path;
  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is required");
  }

  //5
  const avatar = await uploadOnCloudinary(avatarLocalPath);
  let coverImage;
  if (coverImageLocalPath) {
    coverImage = await uploadOnCloudinary(coverImageLocalPath);
  }

  if (!avatar) {
    throw new ApiError(400, "Avatar file from server is required");
  }
  //6
  const user = await User.create({
    fullName,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    email,
    password,
    username: username.toLowerCase(),
  });

  //7
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  //8
  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering the user");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered Successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  //1. req body ->data
  //2. username or email
  //3. find the user
  //4. compare passwords
  //5. generate access and refresh token
  //6. send cookie
  //7. send response

  //1
  const { username, email, password } = req.body;

  //2
  if (!username && !email) {
    throw new ApiError(400, "Username or Email is required");
  }

  //3
  const user = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (!user) {
    throw new ApiError(404, "User doesnt exist");
  }

  //4
  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw ApiError(401, "Invalid user credentials");
  }

  //5
  const { accessToken, refreshToken, loggedUser } =
    await generateAccessAndRefreshTokens(user._id);
  loggedUser.password = undefined;
  loggedUser.refreshToken = undefined;

  const options = {
    httpOnly: true,
    secure: true,
  };

  //6,7
  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        { user: loggedUser, accessToken, refreshToken },
        "User logged in successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: {
        refreshToken: 1,
      },
    },
    { 
        new: true
    }
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res.status(200).clearCookie("accessToken",options).clearCookie("refreshToken",options).json(new ApiResponse(200,{},"User logged out"))

});

const refreshAccessToken = asyncHandler(async(req,res)=>{
  const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;
  if (!incomingRefreshToken) {
    throw new ApiError(401,"Unauthorized Request");
  }

  try {
    const decodedToken = jwt.verify(incomingRefreshToken,process.env.REFRESH_TOKEN_SECRET)
  
    const user = await User.findById(decodedToken?._id);
    if (!user) {
      throw new ApiError(401,"Invalid Refresh Token");
    }
  
    if (incomingRefreshToken !== user.refreshToken) {
      throw new ApiError(401,"Refresh Token is expired or used");
    }
  
    
    const {accessToken,refreshToken} = await generateAccessAndRefreshTokens(user._id)
  
    const options = {
      httpOnly: true,
      secure: true,
    };
  
    res.status(200).cookie("accessToken",accessToken,options).cookie("refreshToken",refreshToken,options).json(new ApiResponse(200,{accessToken,refreshToken},"Access Token Refreshed Successfully"));
    
  } catch (error) {
    throw new ApiError(401,error?.message || "Invalid Refresh Token");
  }
})

const changeCurrentUserPassword = asyncHandler(async(req,res)=>{
  const {oldPassword,newPassword} = req.body;
  const user = await User.findById(req.user?._id);
  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

  if (!isPasswordCorrect) {
    throw new ApiError(400,"Invalid old Password")
  }

  user.password = newPassword;

  await user.save({validateBeforeSave:false})

  return res.status(200).json(new ApiResponse(200,{},"Password Changed Successfully"));

})

const getCurrentUser = asyncHandler(async(req,res)=>{
  res.status(200).json(new ApiResponse(200,req.user,"Current User fetched Successfully"));
})

const updatedAccountDetails = asyncHandler(async(req,res)=>{
  const {fullName,email} = req.body;

  if (!fullName || !email) {
    throw new ApiError(400,"All field are required")
  }

  const user = await User.findByIdAndUpdate(req.user?._id,{
    $set:{fullName,email}
  },{new:true}).select("-password")

  return res.status(200).json(new ApiResponse(200,{user},"Account details updated successfully"))
})

const updateUserAvatar = asyncHandler(async(req,res)=>{

  const avatarLocalPath = await req?.file?.path;
  if (!avatarLocalPath) {
    throw new ApiError(400,"Avatar Image File is Missing");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath)
  if (!avatar.url) {
    throw new ApiError(400,"Error while uploading on avatar");
  }

  const user = await User.findByIdAndUpdate(req.user?._id,{
    $set:{avatar:avatar.url}
  },{new:true}).select("-password")

  //Todo : Delete the old avatar image

  return res.status(200).json(new ApiResponse(200,{user},"Account avatar image updated successfully"))

})

const updateUserCoverImage = asyncHandler(async(req,res)=>{

  const coverLocalPath = await req?.file?.path;
  if (!coverLocalPath) {
    throw new ApiError(400,"Cover Image File is Missing");
  }

  const coverImage = await uploadOnCloudinary(coverLocalPath)
  if (!coverImage.url) {
    throw new ApiError(400,"Error while uploading on cover");
  }

  const user = await User.findByIdAndUpdate(req.user?._id,{
    $set:{coverImage:coverImage.url}
  },{new:true}).select("-password")

  //Todo : Delete the old cover image

  return res.status(200).json(new ApiResponse(200,{user},"Account cover image updated successfully"))

})

const getUserChannelProfile=asyncHandler(async(req,res)=>{
  const {username} = req.params;

  if(!username?.trim()){
    throw new ApiError(400,"Username is missing");
  }

  const channel = await User.aggregate([
    {
      $match:{
        username:username?.toLowerCase()
      }
    },
    {
      $lookup:{
        from:"subscriptions",
        localField:"_id",
        foreignField:"channel",
        as:"subscribers"
      }
    },
    {
      $lookup:{
        from:"subscriptions",
        localField:"_id",
        foreignField:"subscriber",
        as:"subscribedTo"
      }
    },
    {
      $addFields:{
        subscribersCount:{
          $size:"$subscribers"
        },
        channelsSubscribedToCount:{
          $size:"$subscribedTo"
        },
        isSubscribed:{
          $cond:{
            if:{$in:[req.user?._id,"$subscribers.subscriber"]},
            then:true,
            else:false
          }
        }
      }
    },
    {
      $project:{
        fullName:1,
        username:1,
        subscribersCount:1,
        channelsSubscribedToCount:1,
        isSubscribed:1,
        avatar:1,
        coverImage:1,
        email:1
      }
    }
  ])

  if (!channel?.length) {
    throw new ApiError(404,"Channel does not exists");
  }
  return res.status(200).json(new ApiResponse(200,channel[0],"User channel fetched successfully"));
});

const getWatchHistory = asyncHandler(async(req,res)=>{
  const user = await User.aggregate([
    {
      $match:{
        _id: new mongoose.Types.ObjectId(req.user?._id)
      }
    },
    {
      $lookup:{
        from:"videos",
        localField:"watchHistory",
        foreignField:"_id",
        as:"watchHistory",
        pipeline:[
          {
            $lookup:{
              from:"users",
              localField:"owner",
              foreignField:"_id",
              as:"owner",
              pipeline:[{
                $project:{
                  fullName:1,
                  userName:1,
                  avatar:1
                }
              }]
            }
          },
          {
            $addFields:{
              owner:{
                $first:"$owner"
              }
            }
          }
        ]
      }
    }
  ])

  return res.status(200).json(new ApiResponse(200,user[0].watchHistory,"Watch History fetched successfully"));
})

export { registerUser, loginUser, logoutUser ,refreshAccessToken,changeCurrentUserPassword,getCurrentUser,updatedAccountDetails,updateUserAvatar,updateUserCoverImage,getUserChannelProfile,getWatchHistory};
