package com.eazycount.auth.mapper;

import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface LoginMapper {

  List<Map<String, Object>> selectMemberCandidates(
      @Param("accountId") String accountId, @Param("companyId") String companyId);

  int updateAccountLastLogin(@Param("id") int id);

  List<Map<String, Object>> selectUsersForAdmin(
      @Param("loginId") String loginId, @Param("companyId") String companyId);

  int updateUserLastLogin(@Param("userId") int userId);

  int updateUserRememberToken(@Param("token") String token, @Param("userId") int userId);

  String selectSecondaryPassword(@Param("userId") int userId);

  List<Map<String, Object>> selectOwnersForLogin(
      @Param("loginId") String loginId, @Param("companyId") String companyId);

  int updateOwnerPassword(@Param("password") String password, @Param("ownerId") int ownerId);
}
