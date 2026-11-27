import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  type CreateUserDto,
  createUserSchema,
  type ListUsersQuery,
  listUsersQuerySchema,
  type UpdateUserDto,
  type UserIdParam,
  updateUserSchema,
  userIdParamSchema,
} from "@starter/shared";
import { UsersService } from "./users.service.js";

@ApiTags("users")
@Controller("users")
export class UsersController {
  constructor(@Inject(UsersService) private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: "List users (server-side paginated, sorted, filtered)" })
  findAll(@Query({ schema: listUsersQuerySchema }) query: ListUsersQuery) {
    return this.usersService.findAll(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get user by ID" })
  findOne(@Param({ schema: userIdParamSchema }) params: UserIdParam) {
    return this.usersService.findOne(params.id);
  }

  @Post()
  @ApiOperation({ summary: "Create user" })
  create(@Body({ schema: createUserSchema }) body: CreateUserDto) {
    return this.usersService.create(body);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update user" })
  update(
    @Param({ schema: userIdParamSchema }) params: UserIdParam,
    @Body({ schema: updateUserSchema }) body: UpdateUserDto,
  ) {
    return this.usersService.update(params.id, body);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete user" })
  remove(@Param({ schema: userIdParamSchema }) params: UserIdParam) {
    return this.usersService.remove(params.id);
  }
}
