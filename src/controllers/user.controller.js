import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";

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
    throw ApiError(404, "User doesnt exist");
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
      $set: {
        refreshToken: undefined,
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

export { registerUser, loginUser, logoutUser };
